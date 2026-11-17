"use client";

import useSWR from "swr";

import type { User } from "@/lib/types";

export function useUser() {
  const { data, error, isLoading, mutate } = useSWR<User>("/api/auth/me");
  return { user: data, error, isLoading, mutate, currency: data?.currency ?? "BDT" };
}
