"use client";

import { GenericButton } from "./core/GenericButton";
import { GenericButtonSpan } from "./core/GenericButtonSpan";
import { GenericCopy } from "./core/GenericCopy";
import { GenericDescription } from "./core/GenericDescription";
import { GenericInformationCard } from "./core/GenericInformationCard";
import { GenericLineTitle } from "./core/GenericLineTitle";
import { GenericTitle } from "./core/GenericTitle";
import { AduanForm } from "./special/AduanForm";
import AgendaList from "./special/AgendaList";
import { BerandaTempArtwork } from "./special/BerandaTempArtwork";
import { BerandaTitle } from "./special/BerandaTitle";
import DocPage from "./special/DocPage";
import EventDetail from "./special/EventDetail";
import FAQList from "./special/FAQList";
import { KaryaGrid } from "./special/KaryaGrid";
import KKMGrid from "./special/KKMGrid";
import PanduanDivisi from "./special/PanduanDivisi";
import PendaftaranChecklists from "./special/PendaftaranChecklists";
import PendaftaranForm from "./special/PendaftaranForm";
import SekretariatGrid from "./special/SekretariatGrid";
import SekretariatSidebar from "./special/SekretariatSidebar";
import { StrukturOrganisasiGraph } from "./special/StrukturOrganisasiGraph";
import TheWall from "./special/TheWall";
import TimelineSeleksi from "./special/TimelineSeleksi";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RegistryComponent = React.ComponentType<any>;

export const componentRegistry: Record<string, RegistryComponent> = {
  Title: GenericTitle,
  "Beranda Title": BerandaTitle,
  "Line Title": GenericLineTitle,
  Description: GenericDescription,
  Copy: GenericCopy,
  "Information Card": GenericInformationCard,
  Button: GenericButton,
  "Button Span": GenericButtonSpan,
  "Aduan Form": AduanForm,
  "Struktur Organisasi Graph": StrukturOrganisasiGraph,
  "Struktur Kabinet": StrukturOrganisasiGraph,
  "Struktur Organisasi": StrukturOrganisasiGraph,
  "Karya Grid": KaryaGrid,
  "Timeline Seleksi": TimelineSeleksi,
  "FAQ List": FAQList,
  "Agenda List": AgendaList,
  "Sekretariat Grid": SekretariatGrid,
  "Sekretariat Sidebar": SekretariatSidebar,
  "Panduan Divisi": PanduanDivisi,
  Checklists: PendaftaranChecklists,
  "KKM Grid": KKMGrid,
  "Beranda Temp Artwork": BerandaTempArtwork,
  "Doc Page": DocPage,
  "Event Detail": EventDetail,
  "Pendaftaran Form": PendaftaranForm,
  "The Wall": TheWall,
};
