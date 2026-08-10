import Link from "next/link";
import React from "react";

export const metadata = {
  title: "404 — Halaman Tidak Ditemukan | HIMA Musik",
  description: "Halaman yang Anda cari tidak ditemukan atau telah dipindahkan.",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-4xl flex-col items-center justify-center px-4 py-16 text-center">
      {/* Section Header Convention */}
      <div className="mb-6 flex items-center gap-4">
        <span
          className="bg-gold-500/40 block h-px w-8 md:w-12"
          aria-hidden="true"
        />
        <p className="text-gold-500 text-sm font-medium tracking-widest uppercase">
          404 Not Found
        </p>
        <span
          className="bg-gold-500/40 block h-px w-8 md:w-12"
          aria-hidden="true"
        />
      </div>

      <h1 className="font-serif text-5xl font-normal text-white md:text-7xl">
        Halaman Tidak Ditemukan
      </h1>

      <p className="mt-6 max-w-lg text-base leading-relaxed text-neutral-400">
        Maaf, halaman atau alamat tautan yang Anda tuju tidak dapat ditemukan
        atau telah dipindahkan.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/"
          className="bg-gold-500 hover:bg-gold-400 inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold tracking-wider text-black uppercase transition-all duration-300"
          style={{ borderRadius: "var(--radius-action)" }}
        >
          Kembali ke Beranda
        </Link>
        <Link
          href="/faq"
          className="hover:border-gold-500/30 hover:bg-gold-500/10 inline-flex items-center gap-2 border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-neutral-300 transition-all duration-300 hover:text-white"
          style={{ borderRadius: "var(--radius-action)" }}
        >
          Pusat Bantuan / FAQ
        </Link>
      </div>
    </div>
  );
}
