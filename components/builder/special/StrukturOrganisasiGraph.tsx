"use client";

import { usePathname } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";

import RotatingText, { RotatingTextRef } from "@/components/RotatingText";
import { cleanCmsValue } from "@/lib/cms-placeholders";
import {
  fetchDivisionsOnce,
  readCachedDivisions,
} from "@/lib/divisions-client";
import type {
  ProfilModularDivision,
  ProfilModularExecutive,
  ProfilModularMember,
} from "@/lib/notion";
import {
  type Division,
  divisions as staticDivisions,
} from "@/lib/pendaftaran-data";
import useViewEntrance from "@/lib/useViewEntrance";

import { GenericLineTitle } from "../core/GenericLineTitle";

interface StrukturOrganisasiGraphProps {
  value1?: string;
  value2?: string;
  cmsVariables?: Record<string, string>;
}

const fallbackExecutives: ProfilModularExecutive[] = [
  { role: "Ketua Himpunan", name: "Vincent Nuridzati Adittama" },
  { role: "Wakil Ketua", name: "Nadia Fibriani" },
  { role: "Sekretaris", name: "Nuzulul Dian Maulida" },
  { role: "Bendahara", name: "Elizabeth Ardhayu Maheswari" },
  { role: "Co-Sekretaris", name: "Yakobus Tosan Sejati Dinar Purnomo" },
  { role: "Humas", name: "Moses Jovilaga" },
  { role: "Publikasi, Desain & Dokumentasi", name: "Harmony Aulia Keisha" },
  {
    role: "Publikasi, Desain & Dokumentasi",
    name: "Alexandro Hamonangan Hutasoit",
  },
  {
    role: "Publikasi, Desain & Dokumentasi",
    name: "Ken Adonai Zireh Wardoyo",
  },
  { role: "Divisi Program & Event", name: "Syaka Maheswara Adi Suro" },
];

export const StrukturOrganisasiGraph: React.FC<
  StrukturOrganisasiGraphProps
> = ({ value1, value2, cmsVariables }) => {
  const activeDatabaseId = cleanCmsValue(value2, ["Database ID"]);
  const activeBatch =
    cleanCmsValue(value1, ["Tampilkan Batch dari 1 Sampai"]) ||
    cmsVariables?.CURRENT_BATCH ||
    "";
  const pathname = usePathname();
  const isRecruitment = pathname.includes("pendaftaran");

  const [fallbackDivisions, setFallbackDivisions] =
    useState<Division[]>(staticDivisions);

  useEffect(() => {
    const cached = readCachedDivisions();
    if (cached) setFallbackDivisions(cached.divisions);

    fetchDivisionsOnce()
      .then((res) => setFallbackDivisions(res.divisions))
      .catch((err) => console.error("Error fetching divisions in graph:", err));
  }, []);

  // Initialize with cached state if present, else empty baseline.
  // Never show skeleton loading.
  const [data, setData] = useState<{
    executives: ProfilModularExecutive[];
    divisions: ProfilModularDivision[];
    cabinetName: string;
  }>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = window.localStorage.getItem("hima_profil_cache");
        if (cached) {
          const parsed = JSON.parse(cached);
          const payload = parsed?.data || parsed;
          if (payload?.executives?.length || payload?.divisions?.length) {
            return {
              executives: payload.executives || [],
              divisions: payload.divisions || [],
              cabinetName: payload.cabinetName || "",
            };
          }
        }
      } catch {}
    }
    return {
      executives: [],
      divisions: [],
      cabinetName: "",
    };
  });

  const scopeRef = useViewEntrance(pathname, [data]);

  useEffect(() => {
    let isMounted = true;

    const fetchProfilData = async () => {
      try {
        const params = new URLSearchParams();
        if (activeDatabaseId) params.set("databaseId", activeDatabaseId);
        if (activeBatch) params.set("batch", activeBatch);

        const res = await fetch(`/api/profil?${params.toString()}`);
        if (res.ok) {
          const result = await res.json();
          const payload = result?.data || result;
          if (isMounted && payload) {
            setData({
              executives: payload.executives || [],
              divisions: payload.divisions || [],
              cabinetName: payload.cabinetName || "",
            });
            try {
              window.localStorage.setItem(
                "hima_profil_cache",
                JSON.stringify(payload),
              );
            } catch {}
          }
        }
      } catch (err) {
        console.error("Failed to fetch fresh profil data:", err);
      }
    };

    fetchProfilData();
    return () => {
      isMounted = false;
    };
  }, [activeBatch, activeDatabaseId]);

  const executivesList =
    data.executives && data.executives.length > 0
      ? data.executives
      : fallbackExecutives;

  return (
    <div className="relative w-full overflow-x-hidden" ref={scopeRef}>
      <div className="flex w-full flex-col items-center transition-all duration-1000 ease-out">
        <GenericLineTitle value1="BPH" variation1="Center" />
        <div className="mb-12 w-full md:mb-16">
          <OrgChart executives={executivesList} isRecruitment={isRecruitment} />
        </div>

        <GenericLineTitle value1="Divisi" variation1="Center" />
        <DivisionCards
          executives={executivesList}
          divisions={data.divisions}
          fallbackDivisions={fallbackDivisions}
          isRecruitment={isRecruitment}
        />
      </div>
    </div>
  );
};

// --- BPH Tree Component ---

const OrgChart = ({
  executives,
  isRecruitment,
}: {
  executives: ProfilModularExecutive[];
  isRecruitment: boolean;
}) => {
  const branchContainerRef = useRef<HTMLDivElement>(null);
  const sekretarisBranchRef = useRef<HTMLDivElement>(null);
  const bendaharaBranchRef = useRef<HTMLDivElement>(null);
  const [branchConnector, setBranchConnector] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const updateBranchConnector = () => {
      const container = branchContainerRef.current;
      const sekretaris = sekretarisBranchRef.current;
      const bendahara = bendaharaBranchRef.current;

      if (!container || !sekretaris || !bendahara) return;

      const containerRect = container.getBoundingClientRect();
      const sekretarisRect = sekretaris.getBoundingClientRect();
      const bendaharaRect = bendahara.getBoundingClientRect();

      const sekretarisCenter =
        sekretarisRect.left - containerRect.left + sekretarisRect.width / 2;
      const bendaharaCenter =
        bendaharaRect.left - containerRect.left + bendaharaRect.width / 2;

      const left = Math.min(sekretarisCenter, bendaharaCenter);
      const width = Math.abs(bendaharaCenter - sekretarisCenter);

      setBranchConnector({ left, width });
    };

    updateBranchConnector();
    const frameId = requestAnimationFrame(updateBranchConnector);
    window.addEventListener("resize", updateBranchConnector);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateBranchConnector);
    };
  }, [executives]);

  const ketua =
    executives.find((e) => /ketua/i.test(e.role) && !/wakil/i.test(e.role)) ||
    executives[0];
  const wakil = executives.find((e) => /wakil/i.test(e.role));
  const sekretaris = executives.find(
    (e) => /sekretaris/i.test(e.role) && !/co|muda/i.test(e.role),
  );
  const coSekretaris = executives.find((e) =>
    /co.*sekretaris|sekretaris.*muda/i.test(e.role),
  );
  const bendahara = executives.find(
    (e) => /bendahara/i.test(e.role) && !/co|muda/i.test(e.role),
  );
  const coBendahara = executives.find((e) =>
    /co.*bendahara|bendahara.*muda/i.test(e.role),
  );

  return (
    <div className="flex w-full flex-col items-center">
      {/* Ketua */}
      {ketua && (
        <div className="flex w-full max-w-sm flex-col items-center">
          <div className="hover:border-gold-500/30 w-full border border-white/10 bg-white/[0.02] p-5 text-center transition-all duration-1000 ease-out md:p-6">
            <p className="text-gold-500/80 mb-1 font-mono text-[10px] tracking-widest uppercase">
              {ketua.role || "Ketua Himpunan"}
            </p>
            <p className="font-serif text-lg text-white transition-opacity duration-1000 ease-out md:text-xl">
              {ketua.name}
            </p>
            {isRecruitment && ketua.name.includes("[OPEN POSITION]") && (
              <p className="text-gold-400 mt-1.5 font-mono text-[10px] tracking-wider uppercase">
                Posisi Terbuka
              </p>
            )}
          </div>
          <div className="h-8 w-px bg-white/15" />
        </div>
      )}

      {/* Wakil Ketua */}
      {wakil && (
        <div className="flex w-full max-w-sm flex-col items-center">
          <div className="hover:border-gold-500/30 w-full border border-white/10 bg-white/[0.02] p-5 text-center transition-all duration-1000 ease-out md:p-6">
            <p className="mb-1 font-mono text-[10px] tracking-widest text-neutral-400 uppercase">
              {wakil.role || "Wakil Ketua"}
            </p>
            <p className="font-serif text-lg text-white transition-opacity duration-1000 ease-out md:text-xl">
              {wakil.name}
            </p>
            {isRecruitment && wakil.name.includes("[OPEN POSITION]") && (
              <p className="text-gold-400 mt-1.5 font-mono text-[10px] tracking-wider uppercase">
                Posisi Terbuka
              </p>
            )}
          </div>
          <div className="h-8 w-px bg-white/15" />
        </div>
      )}

      {/* Sekretariat & Kebendaharaan */}
      <div className="flex w-full justify-center">
        <div
          ref={branchContainerRef}
          className="relative w-full max-w-2xl px-2 md:px-4"
        >
          <div
            className="absolute top-0 h-px bg-white/15"
            style={{
              left: `${branchConnector.left}px`,
              width: `${branchConnector.width}px`,
            }}
          />

          <div className="flex gap-4 pt-px md:gap-8">
            {/* Sekretaris */}
            <div
              className="flex flex-1 flex-col items-center"
              ref={sekretarisBranchRef}
            >
              <div className="h-8 w-px bg-white/15" />
              <div className="hover:border-gold-500/30 w-full border border-white/10 bg-white/[0.02] p-4 text-center transition-all duration-1000 ease-out md:min-h-[115px] md:p-5">
                <p className="text-gold-500/80 mb-1 font-mono text-[10px] tracking-widest uppercase">
                  {sekretaris?.role || "Sekretaris"}
                </p>
                <p className="font-serif text-base text-white transition-opacity duration-1000 ease-out md:text-lg">
                  {sekretaris?.name || "—"}
                </p>

                {coSekretaris && (
                  <div className="mt-3 border-t border-white/5 pt-2.5">
                    <p className="mb-0.5 font-mono text-[9px] tracking-wider text-neutral-400 uppercase">
                      {coSekretaris.role || "Co-Sekretaris"}
                    </p>
                    <p className="font-serif text-sm text-neutral-300 transition-opacity duration-1000 ease-out">
                      {coSekretaris.name}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Bendahara */}
            <div
              className="flex flex-1 flex-col items-center"
              ref={bendaharaBranchRef}
            >
              <div className="h-8 w-px bg-white/15" />
              <div className="hover:border-gold-500/30 w-full border border-white/10 bg-white/[0.02] p-4 text-center transition-all duration-1000 ease-out md:min-h-[115px] md:p-5">
                <p className="text-gold-500/80 mb-1 font-mono text-[10px] tracking-widest uppercase">
                  {bendahara?.role || "Bendahara"}
                </p>
                <p className="font-serif text-base text-white transition-opacity duration-1000 ease-out md:text-lg">
                  {bendahara?.name || "—"}
                </p>

                {coBendahara && (
                  <div className="mt-3 border-t border-white/5 pt-2.5">
                    <p className="mb-0.5 font-mono text-[9px] tracking-wider text-neutral-400 uppercase">
                      {coBendahara.role || "Co-Bendahara"}
                    </p>
                    <p className="font-serif text-sm text-neutral-300 transition-opacity duration-1000 ease-out">
                      {coBendahara.name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Division Card Component ---

interface ParsedMember {
  name: string;
  isKepala: boolean;
  role: string;
}

const DivisionCard = ({
  name,
  members,
  slots,
  openPositions,
  showSlots = false,
}: {
  name: string;
  members: Array<string | ProfilModularMember>;
  slots: number;
  openPositions: string[];
  showSlots?: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const rotatingTextRef = useRef<RotatingTextRef | null>(null);

  const { leader, staffList } = useMemo(() => {
    const list: ParsedMember[] = members.map((m) => {
      if (typeof m === "string") {
        return { name: m, isKepala: false, role: "Staf" };
      }
      const isLead =
        Boolean(m.isKepala) ||
        (m.role ? /kepala|lead|koordinator/i.test(m.role) : false);
      const cleanRole = m.role || (isLead ? "Kepala Divisi" : "Staf");

      return {
        name: m.name,
        isKepala: isLead,
        role: cleanRole,
      };
    });

    const heads = list.filter((m) => m.isKepala);
    const staff = list.filter((m) => !m.isKepala);

    return {
      leader: heads[0] || null,
      staffList: heads.length > 1 ? [...heads.slice(1), ...staff] : staff,
    };
  }, [members]);

  const rotationTexts = useMemo(() => {
    const defaultText = `${slots} ${slots === 1 ? "Slot" : "Slot"}`;
    if (!openPositions || openPositions.length === 0) return [defaultText];
    return [defaultText, ...openPositions];
  }, [slots, openPositions]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    rotatingTextRef.current?.next();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    rotatingTextRef.current?.reset();
  };

  return (
    <div
      data-animate="up"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group hover:border-gold-500/30 relative flex h-full cursor-default flex-col border border-white/10 bg-white/[0.02] p-5 text-left transition-all duration-1000 ease-out hover:bg-white/[0.04] md:p-6"
    >
      {/* Header: Division Title */}
      <h3 className="group-hover:text-gold-200 font-serif text-lg text-white transition-colors duration-300 md:text-xl">
        {name}
      </h3>

      <div className="my-3.5 h-px w-full bg-white/10" />

      {/* Body */}
      <div className="flex flex-1 flex-col justify-between">
        <div className="space-y-4">
          {/* Kepala Divisi */}
          {leader && (
            <div className="border-b border-white/5 pb-3.5">
              <p className="text-gold-500/80 mb-1 font-mono text-[10px] tracking-wider uppercase">
                {leader.role || "Kepala Divisi"}
              </p>
              <p className="font-serif text-base text-white transition-opacity duration-1000 ease-out">
                {leader.name}
              </p>
            </div>
          )}

          {/* Staf & Anggota */}
          {staffList.length > 0 && (
            <div className="space-y-3">
              {staffList.map((m, idx) => (
                <div
                  key={idx}
                  className="border-b border-white/[0.03] pb-2.5 last:border-b-0 last:pb-0"
                >
                  <p className="mb-0.5 font-mono text-[10px] tracking-wider text-neutral-400 uppercase">
                    {m.role || "Staf"}
                  </p>
                  <p className="font-serif text-sm text-neutral-200 transition-opacity duration-1000 ease-out">
                    {m.name}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!leader && staffList.length === 0 && !showSlots && (
            <p className="py-3 text-xs text-neutral-400 italic">
              Belum ada anggota terdata
            </p>
          )}
        </div>

        {/* Recruitment open positions (if recruitment active) */}
        {showSlots && (slots > 0 || openPositions.length > 0) && (
          <div className="mt-5 border-t border-white/5 pt-3">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="font-mono text-[10px] tracking-wider uppercase">
                Rekrutmen
              </span>
              <span className="text-gold-300 font-serif">
                <RotatingText
                  ref={rotatingTextRef}
                  texts={rotationTexts}
                  mainClassName="overflow-hidden"
                  staggerFrom="last"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "-120%" }}
                  staggerDuration={0.025}
                  splitLevelClassName="overflow-hidden pb-0.5"
                  transition={{
                    type: "spring",
                    damping: 30,
                    stiffness: 400,
                  }}
                  rotationInterval={2500}
                  splitBy="words"
                  auto={isHovered}
                  loop
                />
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Division Cards Grid ---

const DivisionCards = ({
  executives,
  divisions: fetchedDivisions,
  fallbackDivisions,
  isRecruitment,
}: {
  executives: ProfilModularExecutive[];
  divisions?: ProfilModularDivision[];
  fallbackDivisions: Division[];
  isRecruitment: boolean;
}) => {
  const findNamesForDivision = (divisionName: string) => {
    const matches = executives.filter(
      (e) =>
        e.role.toLowerCase().includes(divisionName.toLowerCase()) ||
        divisionName.toLowerCase().includes(e.role.toLowerCase()),
    );
    return matches.map((m) => ({
      name: m.name,
      isKepala: /kepala|lead|koordinator/i.test(m.role),
      role: m.role || "Staf",
    }));
  };

  const activeDivs =
    fetchedDivisions && fetchedDivisions.length > 0 ? fetchedDivisions : null;

  const cardsToRender = activeDivs
    ? activeDivs.map((division) => {
        return (
          <DivisionCard
            key={division.name}
            name={division.name}
            members={division.members}
            slots={division.slots}
            openPositions={division.openPositions}
            showSlots={isRecruitment}
          />
        );
      })
    : fallbackDivisions.map((division) => {
        const staticMembers = findNamesForDivision(division.name);
        return (
          <DivisionCard
            key={division.id || division.name}
            name={division.name}
            members={staticMembers}
            slots={division.slots}
            openPositions={division.openPositions || []}
            showSlots={isRecruitment}
          />
        );
      });

  return (
    <div className="w-full transition-all duration-1000 ease-out">
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
        {cardsToRender}
      </div>
    </div>
  );
};
