/**
 * Notion CMS Glossarium — Property Name Constants
 * ==================================================
 * Eliminates magic strings for Notion database property access.
 * Organized by database for discoverability.
 *
 * Convention: PROP_<DB_SHORT>_<PROPERTY_CAMEL>
 * Common props shared across multiple DBs use PROP_COMMON_.
 */

// ──────────────────────────────────────────────────────────────
//  Common properties (used across multiple databases)
// ──────────────────────────────────────────────────────────────

export const PROP = {
  /** Title property (most databases) */
  NAME: "Name",
  /** Slug for URL routing */
  SLUG: "Slug",
  /** Show/hide toggle */
  SHOW: "Show",
  /** Generic status */
  STATUS: "Status",
  /** Sort order */
  ORDER: "Order",
  /** Description text */
  DESKRIPSI: "Deskripsi",
  /** Value field */
  VALUE: "Value",
  VALUE_2: "Value 2",
  VALUE_3: "Value 3",
} as const;

// ──────────────────────────────────────────────────────────────
//  01 Pages
// ──────────────────────────────────────────────────────────────

export const PROP_PAGES = {
  NAME: "Name",
  SLUG: "Slug",
  TIPE: "Tipe",
  SHOW_IN_NAV: "Show In Nav",
  TAMPILKAN_DI_NAVBAR: "Tampilkan Di Navbar",
  URUTAN: "Urutan",
  SHOW_FOOTER: "Show Footer",
  MAX_WIDTH: "Max Width",
  SEO_TITLE: "SEO Title",
  SEO_DESCRIPTION: "SEO Description",
  SEO_KEYWORDS: "SEO Keywords",
} as const;

export type PageTipe = "Page" | "Redirect";

// ──────────────────────────────────────────────────────────────
//  01 Sections
// ──────────────────────────────────────────────────────────────

export const PROP_SECTIONS = {
  SECTION: "Section",
  PAGE: "01 Pages",
  SLUG: "Slug",
  ORDER: "Order",
  SHOW: "Show",
  HEIGHT: "Height",
} as const;

export type SectionHeight = "Full Viewport" | "Fit Content";

// ──────────────────────────────────────────────────────────────
//  01 Content Component
// ──────────────────────────────────────────────────────────────

export const PROP_CONTENT_COMPONENT = {
  COMPONENT_VARIATION: "Component Variation",
  SHOW: "Show",
  ORDER_OR_GROUP: "Order or Group",
  VALUE: "Value",
  VALUE_2: "Value 2",
  VALUE_3: "Value 3",
  /** Relation → 01 Component Types */
  COMPONENT_TYPES: "01 Component Types",
  /** Relation → 01 Sections */
  SECTIONS: "01 Sections",
  /** Relation → 01 Group Div Category */
  GROUP_DIV_CATEGORY: "01 Group Div Category",
  PAGE: "Page",
} as const;

// ──────────────────────────────────────────────────────────────
//  01 Component Types
// ──────────────────────────────────────────────────────────────

export const PROP_COMPONENT_TYPES = {
  NAME: "Name",
  TYPE: "Type",
  VARIATION_1: "Variation 1",
  VARIATION_2: "Variation 2",
  VARIATION_3: "Variation 3",
  VALUE_1: "Value 1",
  VALUE_2: "Value 2",
  VALUE_3: "Value 3",
  /** Relation → 01 Content Component */
  CONTENT_COMPONENT: "01 Content Component",
} as const;

// ──────────────────────────────────────────────────────────────
//  01 Variables
// ──────────────────────────────────────────────────────────────

export const PROP_VARIABLES = {
  VARIABLE: "Variable",
  VALUE: "Value",
} as const;

// ──────────────────────────────────────────────────────────────
//  01 Footer
// ──────────────────────────────────────────────────────────────

export const PROP_FOOTER = {
  NAME: "Name",
  SHOW: "Show",
  GROUP: "Group",
} as const;

export type FooterGroup = "2 Grid" | "1 Whole";

// ──────────────────────────────────────────────────────────────
//  01 Redirect
// ──────────────────────────────────────────────────────────────

export const PROP_REDIRECT = {
  NAME: "Name",
  SOURCE_PATH: "Source Path",
  DESTINATION_URL: "Destination URL",
} as const;

// ──────────────────────────────────────────────────────────────
//  01 Group Div Category
// ──────────────────────────────────────────────────────────────

export const PROP_GROUP_DIV_CATEGORY = {
  NAME: "Name",
  TYPE: "Type",
  /** Relation → 01 Content Component */
  CONTENT_COMPONENT: "01 Content Component",
} as const;

// ──────────────────────────────────────────────────────────────
//  01 Mindset
// ──────────────────────────────────────────────────────────────

export const PROP_MINDSET = {
  NAME: "Name",
  DESKRIPSI: "Deskripsi",
} as const;

// ──────────────────────────────────────────────────────────────
//  02 Storage: FAQ
// ──────────────────────────────────────────────────────────────

export const PROP_FAQ = {
  JUDUL_PERTANYAAN: "Judul Pertanyaan",
  NAMA_PENANYA: "Nama Penanya",
  JAWABAN: "Jawaban",
  STATUS: "Status",
  VISIBILITAS: "Visibilitas",
  KATEGORI: "Kategori",
  TANGGAL_DITANYAKAN: "Tangal Ditanyakan",
  LAST_EDITED_TIME: "Last Edited Time",
} as const;

export type FAQStatus =
  | "Masuk"
  | "Ditinjau"
  | "Disembunyikan"
  | "Dialihkan"
  | "Dijawab";
export type FAQKategori =
  | "Lainnya"
  | "Akademik"
  | "Organisasi (HIMA)"
  | "Kegiatan / Event"
  | "Pendaftaran";

// ──────────────────────────────────────────────────────────────
//  02 Struktur Organisasi
// ──────────────────────────────────────────────────────────────

export const PROP_STRUKTUR_ORGANISASI = {
  NAMA_DIVISI: "Nama Divisi",
  DESKRIPSI_DIVISI: "Deskripsi Divisi",
  SKILL_UNIK: "Skill Unik",
  /** Relation → 03 Tugas Utama Divisi */
  TUGAS_UTAMA_DIVISI: "03 Tugas Utama Divisi",
  /** Relation → 04 Nama Jabatan */
  NAMA_JABATAN: "04 Nama Jabatan",
  /** Relation → 03 SDM & Evaluasi */
  SDM_EVALUASI: "03 SDM & Evaluasi",
} as const;

// ──────────────────────────────────────────────────────────────
//  02 KKM
// ──────────────────────────────────────────────────────────────

export const PROP_KKM = {
  NAME: "Name",
  SLUG: "Slug",
  JARGON: "Jargon",
  DESKRIPSI_SINGKAT: "Deskripsi Singkat",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  LAINNYA: "Lainnya",
  LOGO: "Logo",
  FOTO_KKM: "Foto KKM",
} as const;

// ──────────────────────────────────────────────────────────────
//  02 Storage: Aduan
// ──────────────────────────────────────────────────────────────

export const PROP_ADUAN = {
  NAMA: "Nama",
  NIM: "NIM",
  KONTAK_PENGADU: "Kontak Pengadu",
  PESAN: "Pesan",
  STATUS: "Status",
  /** Relation → 03 Kategori Aduan */
  KATEGORI_ADUAN: "03 Kategori Aduan",
} as const;

export type AduanStatus = "Masuk" | "Diproses" | "Tidak Selesai" | "Selesai";

// ──────────────────────────────────────────────────────────────
//  02 Form & Storage: Karya
// ──────────────────────────────────────────────────────────────

export const PROP_KARYA = {
  JUDUL_KARYA: "Band/Artist dan Judul Karya / Tayangan",
  PENCIPTA_PENAMPIL: "Pencipta / Penampil",
  PLATFORM_UTAMA: "Platform Utama",
  GENRE_JENIS_KARYA: "Genre / Jenis Karya",
  LINK_EMBED: "Link Embed Utama (Full URL)",
  NIM_PENANGGUNG_JAWAB: "NIM Penanggung Jawab",
  EMAIL: "Email",
  STATUS: "Status",
  SUBMISSION_TIME: "Submission time",
} as const;

export type KaryaStatus = "Masuk" | "Di-review" | "Published";

// ──────────────────────────────────────────────────────────────
//  02 Form & Storage: Agenda
// ──────────────────────────────────────────────────────────────

export const PROP_AGENDA = {
  NAMA_ACARA: "Nama Acara",
  TANGGAL_ACARA: "Tanggal Acara",
  DESKRIPSI_SINGKAT_ACARA: "Deskripsi Singkat Acara",
  LOKASI_ACARA: "Lokasi Acara",
  KKM_PENGUSUL: "KKM Pengusul",
  GAMBAR: "Gambar",
  REQUEST_SLUG_KHUSUS: "Request Slug Khusus",
  STATUS: "Status",
  SUBMISSION_TIME: "Submission time",
} as const;

export type AgendaStatus = "Masuk" | "Diedit KKM" | "Published";

// ──────────────────────────────────────────────────────────────
//  02 Dokumen Sekretariat
// ──────────────────────────────────────────────────────────────

export const PROP_DOKUMEN_SEKRETARIAT = {
  NAMA_DOKUMEN: "Nama Dokumen",
  SLUG: "Slug",
  URUTAN_TAMPIL: "Urutan Tampil",
  STATUS: "Status",
  /** Relation → 03 Kategori Dokumen */
  KATEGORI_DOKUMEN: "03 Kategori Dokumen",
} as const;

export type DokumenStatus = "Draft" | "Peninjauan" | "Publish" | "Arsip";

// ──────────────────────────────────────────────────────────────
//  03 SDM & Evaluasi
// ──────────────────────────────────────────────────────────────

export const PROP_SDM = {
  NAMA_LENGKAP_STAF: "Nama Lengkap Staf",
  NIM: "NIM",
  DISCORD_UID: "Discord UID",
  EMAIL_PRIBADI: "Email Pribadi",
  NOMOR_WHATSAPP: "Nomor WhatsApp",
  ANGKATAN_KAMPUS: "Angkatan Kampus",
  STATUS_KEAKTIFAN: "Status Keaktifan",
  REKENING_REIMBURSEMENT: "Rekening Reimbursement",
  KRS: "KRS",
  AKUN_TERHUBUNG: "Akun Terhubung",
  POIN_PELANGGARAN: "Poin Pelanggaran",
  INDIKATOR_SP: "Indikator SP",
  /** Relation → 02 Struktur Organisasi */
  STRUKTUR_ORGANISASI: "02 Struktur Organisasi",
  /** Relation → 04 Nama Jabatan */
  NAMA_JABATAN: "04 Nama Jabatan",
  /** Relation → 04 Tipe Jabatan */
  TIPE_JABATAN: "04 Tipe Jabatan",
  /** Relation → 04 Jobdesk Jabatan */
  JOBDESK_JABATAN: "04 Jobdesk Jabatan",
  /** Relation → 03 Batch Pendaftaran */
  BATCH_PENDAFTARAN: "03 Batch Pendaftaran",
  /** Relation → 03 Proyek */
  PROYEK: "03 Proyek",
  /** Relation → 03 Rekam Presensi */
  REKAM_PRESENSI: "03 Rekam Presensi",
  /** Relation → 03 Tugas/Ticket */
  TUGAS_TICKET: "03 Tugas/Ticket",
  /** Relation → 02 Storage: Pendaftaran (Pilihan 1) */
  PENDAFTARAN_PILIHAN_1: "02 Storage: Pendaftaran Pilihan 1",
  /** Relation → 02 Storage: Pendaftaran (Pilihan 2) */
  PENDAFTARAN_PILIHAN_2: "02 Storage: Pendaftaran Pilihan 2",
  /** Relation → Keuangan */
  KEUANGAN: "Keuangan",
} as const;

export type StatusKeaktifan =
  | "Rekrutmen"
  | "Diberhentikan"
  | "Demisioner"
  | "Cuti"
  | "Aktif";
export type AngkatanKampus =
  | "Angkatan 26"
  | "Angkatan 25"
  | "Angkatan 24"
  | "Angkatan 23";

// ──────────────────────────────────────────────────────────────
//  03 Kategori Aduan
// ──────────────────────────────────────────────────────────────

export const PROP_KATEGORI_ADUAN = {
  NAME: "Name",
  ORDER: "Order",
  /** Relation → 02 Storage: Aduan */
  STORAGE_ADUAN: "02 Storage: Aduan",
} as const;

// ──────────────────────────────────────────────────────────────
//  03 Kategori Dokumen
// ──────────────────────────────────────────────────────────────

export const PROP_KATEGORI_DOKUMEN = {
  NAME: "Name",
  DESKRIPSI: "Deskripsi",
  /** Relation → 02 Dokumen Sekretariat */
  DOKUMEN_SEKRETARIAT: "02 Dokumen Sekretariat",
} as const;

// ──────────────────────────────────────────────────────────────
//  03 Tugas Utama Divisi
// ──────────────────────────────────────────────────────────────

export const PROP_TUGAS_UTAMA_DIVISI = {
  TUGAS: "Tugas",
  ORDER: "Order",
  /** Relation → 02 Struktur Organisasi */
  STRUKTUR_ORGANISASI: "02 Struktur Organisasi",
} as const;

// ──────────────────────────────────────────────────────────────
//  03 Batch Pendaftaran
// ──────────────────────────────────────────────────────────────

export const PROP_BATCH_PENDAFTARAN = {
  NAME: "Name",
  /** Relation → 03 Tahapan Rekrutmen */
  TAHAPAN_REKRUTMEN: "03 Tahapan Rekrutmen",
  /** Relation → 03 SDM & Evaluasi */
  SDM_EVALUASI: "03 SDM & Evaluasi",
  /** Relation → 02 Storage: Pendaftaran */
  PENDAFTARAN_STORAGE: "02 Storage: Pendaftaran",
} as const;

// ──────────────────────────────────────────────────────────────
//  03 Tahapan Rekrutmen
// ──────────────────────────────────────────────────────────────

export const PROP_TAHAPAN_REKRUTMEN = {
  NAME: "Name",
  DATE: "Date",
  /** Relation → 03 Batch Pendaftaran */
  BATCH_PENDAFTARAN: "03 Batch Pendaftaran",
  /** Relation → 03 Proyek */
  PROYEK: "03 Proyek",
} as const;

// ──────────────────────────────────────────────────────────────
//  02 Storage: Pendaftaran
// ──────────────────────────────────────────────────────────────

export const PROP_PENDAFTARAN = {
  NAME: "Name",
  NIM: "NIM",
  KONTAK: "Kontak",
  MOTIVASI: "Motivasi",
  LINK_PORTFOLIO: "Link Portfolio",
  STATUS_SELEKSI: "Status Seleksi",
  SUBMISSION_TIME: "Submission Time",
  /** Relation → 03 Batch Pendaftaran */
  BATCH_PENDAFTARAN: "03 Batch Pendaftaran",
  /** Relation → 03 SDM & Evaluasi (Pilihan 1) */
  SDM_EVALUASI_PILIHAN_1: "03 SDM & Evaluasi Pilihan 1",
  /** Relation → 03 SDM & Evaluasi (Pilihan 2) */
  SDM_EVALUASI_PILIHAN_2: "03 SDM & Evaluasi Pilihan 2",
  PILIHAN_1: "Pilihan 1",
  PILIHAN_2: "Pilihan 2",
} as const;

export type StatusSeleksi = "Masuk" | "Interview" | "Diterima" | "Ditolak";
