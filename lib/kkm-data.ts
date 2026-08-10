/* ------------------------------------------------------------------ */
/*  KKM (Kelompok Kegiatan Mahasiswa) data contracts                   */
/* ------------------------------------------------------------------ */

export interface KKMGroup {
  /** Notion page ID of the KKM entry */
  id: string;
  slug: string;
  name: string;
  /** Maps from the `Jargon` rich_text property */
  tagline: string;
  /** Maps from the `Deskripsi Singkat` rich_text property */
  description: string;
  /** First file URL from the `Logo` files property, or null */
  logoUrl: string | null;
  /** First file URL from the `Foto KKM` files property, or null */
  fotoUrl: string | null;
  /** `Instagram` url property */
  instagram: string;
  /** `TikTok` url property */
  tiktok: string;
  /** `YouTube` url property */
  youtube: string;
  /** `Lainnya` url property */
  lainnya: string;
  /**
   * Derived convenience array of non-empty social URLs
   * ([instagram, tiktok, youtube] filtered for truthy values).
   * Kept for backward-compat with KKMPortal.tsx card rendering.
   */
  socialLinks: string[];
  /** Optional sort order from Notion */
  order?: number;
}
