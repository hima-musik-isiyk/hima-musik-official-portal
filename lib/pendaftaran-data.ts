export type Division = {
  id: string;
  name: string;
  summary: string;
  slots: number;
  focus: string;
  tasks: string[];
  skills: string[];
  commitment: string;
  openPositions?: string[];
  /** Jabatan open to the newest angkatan (Tipe Jabatan "Staf Muda"). */
  juniorPositions?: string[];
};

export const divisions: Division[] = [
  {
    id: "humas",
    name: "Humas & Kemitraan",
    summary:
      "Menjaga relasi internal kampus dan eksternal, kolaborasi event, dan komunikasi antar organisasi. Slot: 1 orang, terbuka untuk angkatan 2023–2025.",
    slots: 1,
    focus: "Relasi internal & eksternal, komunikasi strategis",
    tasks: [
      "Mengelola komunikasi dengan mitra internal (prodi, dosen, HIMA lain, KKM) dan eksternal (sponsor, komunitas musik, media partner)",
      "Menginisiasi peluang kerja sama dan melakukan negosiasi dengan calon mitra",
      "Menjadi penghubung antar divisi dan pihak luar",
    ],
    skills: ["Communication", "Negotiation", "Networking"],
    commitment: "Fleksibel sesuai agenda kolaborasi",
  },
  {
    id: "program-event",
    name: "Divisi Program & Event",
    summary:
      "Merancang konsep kegiatan, menyusun rundown, manajemen kepanitiaan, dan eksekusi event HIMA. Slot: 2 orang, terbuka untuk angkatan 2023–2025.",
    slots: 2,
    focus: "Perencanaan, konsep acara & eksekusi event",
    tasks: [
      "Menyusun konsep dan perencanaan acara",
      "Koordinasi teknis, logistik, dan manajemen kepanitiaan",
      "Menjaga flow acara saat eksekusi",
    ],
    skills: ["Planning", "Coordination", "Problem Solving"],
    commitment: "Intensif saat persiapan event",
  },
  {
    id: "pdd",
    name: "Publikasi, Desain & Dokumentasi",
    summary:
      "Menghasilkan konten visual, dokumentasi kegiatan, dan identitas kampanye. Slot: 3 orang, terbuka untuk angkatan 2023–2025. Terdapat 3 sub-fokus: Desain (visual identity, poster, brand guideline), Publikasi & Media Sosial (content calendar, distribusi info), Dokumentasi (foto/video, aftermovie).",
    slots: 3,
    focus: "Branding, storytelling & dokumentasi",
    tasks: [
      "Desain: membuat visual identity, poster, feed IG, template, brand guideline",
      "Publikasi & Media Sosial: menyusun content calendar, distribusi info, kelola platform",
      "Dokumentasi: fotografi/videografi kegiatan, seleksi & arsip, aftermovie",
    ],
    skills: ["Design", "Photography", "Storytelling", "Content Creation"],
    commitment: "Menyesuaikan timeline publikasi dan jadwal event",
  },
  {
    id: "co-sekretaris",
    name: "Co-Sekretaris",
    summary:
      "Membantu kinerja Sekretaris dalam administrasi internal harian, notulensi, dan database keanggotaan. Slot: 1 orang, khusus angkatan 2024–2025.",
    slots: 1,
    focus: "Administrasi & dokumentasi internal",
    tasks: [
      "Membantu administrasi internal harian",
      "Notulensi rapat dan kegiatan",
      "Mengelola database keanggotaan",
    ],
    skills: ["Organization", "Attention to Detail", "Communication"],
    commitment: "Rutin mengikuti rapat dan koordinasi internal",
  },
  {
    id: "co-bendahara",
    name: "Co-Bendahara",
    summary:
      "Membantu Bendahara dalam pencatatan transaksi, kwitansi, laporan keuangan per acara, dan penyusunan RAB. Slot: 1 orang, khusus angkatan 2024–2025.",
    slots: 1,
    focus: "Keuangan & transparansi anggaran",
    tasks: [
      "Pencatatan transaksi dan kwitansi",
      "Menyusun laporan keuangan per acara",
      "Membantu penyusunan Rencana Anggaran Biaya (RAB)",
    ],
    skills: ["Accounting basics", "Organization", "Integrity"],
    commitment: "Rutin mengikuti rapat dan koordinasi keuangan",
  },
];

export const RECRUITMENT_TITLE = "Batch 1";
export const RECRUITMENT_PERIOD = "27 Februari – 03 Maret 2026";

export const SELECTION_TIMELINE = [
  {
    title: "Pendaftaran",
    date: "27 Feb – 03 Maret 2026",
    description: "Deadline: 15:00 WIB. Pastikan data diri sudah sesuai.",
  },
  {
    title: "Pengumuman Wawancara",
    date: "03 Maret 2026",
    description: "Pukul 18:00 WIB via kanal resmi HIMA Musik.",
  },
  {
    title: "Wawancara",
    date: "04 Maret 2026",
    description: "Waktu menyusul. Siapkan visi dan portofolio terbaikmu.",
  },
  {
    title: "Pengumuman Akhir",
    date: "10 Maret 2026",
    description: "Selamat bergabung di keluarga besar HIMA Musik!",
  },
];
