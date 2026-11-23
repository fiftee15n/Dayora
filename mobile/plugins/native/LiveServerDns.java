package app.dayora.mobile;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import okhttp3.Dns;

/**
 * Finds an address of the live server that this network can actually reach.
 *
 * Some Bangladeshi mobile networks can't connect to some of Vercel's addresses. OkHttp 4 tries
 * addresses one by one, so one dead address blocks the whole app. For the live host only, this
 * tries the addresses at (almost) the same time and puts the first one that answers in front.
 *
 * OkHttp still checks the HTTPS certificate of whatever it connects to, so a wrong address can
 * fail but can't impersonate the server.
 */
public class LiveServerDns implements Dns {
  private static final int CONNECT_MS = 6000;
  private static final int TOTAL_MS = 8000;
  private static final int BACKUP_DELAY_MS = 400;
  private static final long REMEMBER_MS = 30_000;

  private final String host;
  private final int port;
  private final List<String> backups;
  private final Dns system;
  private final SSLSocketFactory tls;

  private List<InetAddress> remembered;
  private long rememberedAt;

  public LiveServerDns(String host, List<String> backups) {
    this(host, 443, backups, Dns.SYSTEM, HttpsURLConnection.getDefaultSSLSocketFactory());
  }

  LiveServerDns(String host, int port, List<String> backups, Dns system, SSLSocketFactory tls) {
    this.host = host;
    this.port = port;
    this.backups = backups;
    this.system = system;
    this.tls = tls;
  }

  @Override
  public List<InetAddress> lookup(String name) throws UnknownHostException {
    if (!name.equalsIgnoreCase(host)) return system.lookup(name);
    // One lookup at a time: requests that start together share the result.
    synchronized (this) {
      long now = System.nanoTime() / 1_000_000;
      if (remembered != null && now - rememberedAt < REMEMBER_MS) return remembered;

      LinkedHashSet<InetAddress> all = new LinkedHashSet<>();
      UnknownHostException dnsError = null;
      try {
        all.addAll(system.lookup(name));
      } catch (UnknownHostException e) {
        dnsError = e;
      }
      int fromDns = all.size();
      for (String ip : backups) all.add(InetAddress.getByName(ip));

      List<InetAddress> list = new ArrayList<>(all);
      InetAddress winner = race(list, fromDns);
      if (winner == null) {
        // Nothing answered (probably offline): behave as if this class wasn't here.
        if (dnsError != null) throw dnsError;
        return list.subList(0, fromDns);
      }
      list.remove(winner);
      list.add(0, winner);
      remembered = list;
      rememberedAt = System.nanoTime() / 1_000_000;
      return list;
    }
  }

  /** The first address to complete a TLS handshake, or null. */
  private InetAddress race(List<InetAddress> list, int fromDns) {
    BlockingQueue<Object> results = new LinkedBlockingQueue<>();
    for (int i = 0; i < list.size(); i++) {
      InetAddress address = list.get(i);
      // The addresses DNS gave get a head start.
      int delay = i < fromDns ? 0 : (fromDns == 0 ? 0 : BACKUP_DELAY_MS);
      Thread t =
          new Thread(
              () -> {
                try {
                  if (delay > 0) Thread.sleep(delay);
                  if (!results.isEmpty() && results.peek() instanceof InetAddress) return;
                  handshake(address);
                  results.add(address);
                } catch (Exception e) {
                  results.add(e);
                }
              },
              "dayora-connect");
      t.setDaemon(true);
      t.start();
    }
    long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(TOTAL_MS);
    try {
      for (int done = 0; done < list.size(); done++) {
        Object r = results.poll(Math.max(0, end - System.nanoTime()), TimeUnit.NANOSECONDS);
        if (r == null) return null;
        if (r instanceof InetAddress) return (InetAddress) r;
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
    return null;
  }

  private void handshake(InetAddress address) throws IOException {
    try (Socket raw = new Socket()) {
      raw.connect(new InetSocketAddress(address, port), CONNECT_MS);
      raw.setSoTimeout(CONNECT_MS);
      try (SSLSocket ssl = (SSLSocket) tls.createSocket(raw, host, port, true)) {
        // Also check the name, so a redirected address (e.g. a block page) can't win the race.
        SSLParameters params = ssl.getSSLParameters();
        params.setEndpointIdentificationAlgorithm("HTTPS");
        ssl.setSSLParameters(params);
        ssl.startHandshake();
      }
    }
  }
}
