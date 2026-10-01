"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

import { IconChevronDown } from "@/components/Icons";
import {
  fetchDivisionsOnce,
  readCachedDivisions,
} from "@/lib/divisions-client";
import {
  type Division,
  divisions as staticDivisions,
} from "@/lib/pendaftaran-data";

type RecruitmentFormData = {
  firstChoice: string;
  firstChoicePosition: string;
  secondChoice: string;
  secondChoicePosition: string;
  angkatan: string;
  pddSubfocus: string;
  fullName: string;
  nim: string;
  email: string;
  phone: string;
  instagram: string;
  motivation: string;
  experience: string;
  availability: string[];
  portfolio: string;
};

type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

type StoredRecruitmentState = {
  data: RecruitmentFormData;
  timestamp: number;
  step: number;
};

const STORAGE_KEY = "pendaftaran_form_state_v1";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const steps = [
  { id: 0, label: "Posisi" },
  { id: 1, label: "Data Diri" },
  { id: 2, label: "Motivasi" },
  { id: 3, label: "Review" },
];

const availabilityOptions = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

const MIN_MOTIVATION_CHARS = 100;
const MAX_MOTIVATION_CHARS = 1500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NIM_PATTERN = /^\d{10,12}$/;
const PHONE_PATTERN = /^(?:\+62|62|0)8\d{7,11}$/;

export default function PendaftaranForm() {
  const [divisions, setDivisions] = useState<Division[]>(staticDivisions);
  // True once the live Notion list arrives; cached/static lists may be stale.
  const [hasLiveDivisions, setHasLiveDivisions] = useState(false);
  const [angkatanList, setAngkatanList] = useState<string[]>([
    "2023",
    "2024",
    "2025",
  ]);
  const [juniorAngkatan, setJuniorAngkatan] = useState<string | null>(null);

  useEffect(() => {
    const cached = readCachedDivisions();
    if (cached) {
      setDivisions(cached.divisions);
      if (cached.angkatanList) setAngkatanList(cached.angkatanList);
      setJuniorAngkatan(cached.juniorAngkatan ?? null);
    }

    fetchDivisionsOnce()
      .then((res) => {
        setDivisions(res.divisions);
        if (res.angkatanList) setAngkatanList(res.angkatanList);
        setJuniorAngkatan(res.juniorAngkatan ?? null);
        setHasLiveDivisions(true);
      })
      .catch((err) => console.error("Error fetching divisions in form:", err));
  }, []);

  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [isDivisionModalOpen, setIsDivisionModalOpen] = useState(false);
  const [formData, setFormData] = useState<RecruitmentFormData>({
    firstChoice: "",
    firstChoicePosition: "",
    secondChoice: "",
    secondChoicePosition: "",
    angkatan: "",
    pddSubfocus: "",
    fullName: "",
    nim: "",
    email: "",
    phone: "",
    instagram: "",
    motivation: "",
    experience: "",
    availability: [],
    portfolio: "",
  });
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showRestoreNotice, setShowRestoreNotice] = useState(false);
  const [hasTouchedForm, setHasTouchedForm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showStepErrors, setShowStepErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const stepBarRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollOnStepChangeRef = useRef(false);
  const formContainerRef = useRef<HTMLFormElement | null>(null);
  const isPddSelected =
    formData.firstChoice === "pdd" || formData.secondChoice === "pdd";

  const currentDivision = divisions.find(
    (division) => division.id === formData.firstChoice,
  );
  const trimmedFullName = formData.fullName.trim();
  const trimmedNim = formData.nim.trim();
  const trimmedEmail = formData.email.trim();
  const trimmedPhone = formData.phone.trim();
  const cleanPhone = trimmedPhone.replace(/\D/g, "");
  const trimmedMotivation = formData.motivation.trim();
  const motivationLength = trimmedMotivation.length;
  const isEmailValid = EMAIL_PATTERN.test(trimmedEmail);
  const isNimValid = NIM_PATTERN.test(trimmedNim);
  const isPhoneValid = PHONE_PATTERN.test(cleanPhone);
  const isMotivationValid =
    motivationLength >= MIN_MOTIVATION_CHARS &&
    motivationLength <= MAX_MOTIVATION_CHARS;
  const fullNameError = !trimmedFullName ? "Nama lengkap wajib diisi." : "";
  const nimError = !trimmedNim
    ? "NIM wajib diisi."
    : !isNimValid
      ? "NIM harus 10–12 digit angka."
      : "";
  const emailError = !trimmedEmail
    ? "Email wajib diisi."
    : !isEmailValid
      ? "Format email tidak valid."
      : "";
  const phoneError = !trimmedPhone
    ? "Nomor WhatsApp wajib diisi."
    : !isPhoneValid
      ? "Gunakan format 08xxxxxxxxxx atau +628xxxxxxxxxx."
      : "";
  const motivationError = !trimmedMotivation
    ? "Motivasi wajib diisi."
    : motivationLength < MIN_MOTIVATION_CHARS
      ? `Minimal ${MIN_MOTIVATION_CHARS} karakter.`
      : motivationLength > MAX_MOTIVATION_CHARS
        ? `Maksimal ${MAX_MOTIVATION_CHARS} karakter.`
        : "";

  const isAngkatanRestricted =
    (formData.firstChoice === "co-sekretaris" ||
      formData.firstChoice === "co-bendahara") &&
    formData.angkatan === "2023";
  const angkatanError = !formData.angkatan
    ? "Angkatan wajib dipilih."
    : isAngkatanRestricted
      ? "Posisi ini hanya tersedia untuk angkatan 2024\u20132025."
      : "";

  // Newest angkatan may only apply for Staf Muda jabatan.
  const isJuniorApplicant =
    Boolean(juniorAngkatan) && formData.angkatan === juniorAngkatan;
  const isJuniorBlocked = (divisionId: string, position: string) => {
    if (!isJuniorApplicant || !divisionId || !position) return false;
    const division = divisions.find((d) => d.id === divisionId);
    return Boolean(
      division?.juniorPositions && !division.juniorPositions.includes(position),
    );
  };
  const juniorBlockedChoices = [
    isJuniorBlocked(formData.firstChoice, formData.firstChoicePosition) && "1",
    isJuniorBlocked(formData.secondChoice, formData.secondChoicePosition) &&
      "2",
  ].filter(Boolean);
  const juniorPositionError =
    juniorBlockedChoices.length > 0
      ? `Angkatan ${juniorAngkatan} tidak dapat mendaftar sebagai Staf Penuh, hanya Staf Muda. Silakan ganti jabatan pilihan ${juniorBlockedChoices.join(" dan ")}.`
      : "";

  const isStepComplete = (stepId: number): boolean => {
    if (stepId === 0) {
      const firstDiv = divisions.find((d) => d.id === formData.firstChoice);
      const requiresFirstPos =
        firstDiv?.openPositions && firstDiv.openPositions.length > 0;
      const hasFirstPos =
        !requiresFirstPos || Boolean(formData.firstChoicePosition);

      const secondDiv = divisions.find((d) => d.id === formData.secondChoice);
      const requiresSecondPos =
        secondDiv?.openPositions && secondDiv.openPositions.length > 0;
      const hasSecondPos =
        !formData.secondChoice ||
        !requiresSecondPos ||
        Boolean(formData.secondChoicePosition);

      return Boolean(
        formData.firstChoice &&
        hasFirstPos &&
        hasSecondPos &&
        formData.angkatan &&
        !isAngkatanRestricted &&
        !juniorPositionError,
      );
    }
    if (stepId === 1) {
      return Boolean(
        trimmedFullName && isNimValid && isEmailValid && isPhoneValid,
      );
    }
    if (stepId === 2) {
      return Boolean(isMotivationValid && formData.availability.length > 0);
    }
    return false;
  };

  const isStepValid =
    step === 3
      ? isStepComplete(0) && isStepComplete(1) && isStepComplete(2)
      : isStepComplete(step);

  const hasEditedCurrentStep: boolean = ((): boolean => {
    if (step === 0) {
      return Boolean(formData.firstChoice || formData.angkatan);
    }
    if (step === 1) {
      return Boolean(
        formData.fullName.trim() ||
        formData.nim.trim() ||
        formData.email.trim() ||
        formData.phone.trim(),
      );
    }
    if (step === 2) {
      return Boolean(
        formData.motivation.trim() || formData.availability.length > 0,
      );
    }
    return false;
  })();

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as StoredRecruitmentState | null;
      if (!parsed || typeof parsed !== "object") {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }

      const { data, timestamp, step: storedStep } = parsed;

      if (!data || typeof timestamp !== "number") {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }

      if (Date.now() - timestamp > DAY_IN_MS) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }

      const stringFields: (keyof RecruitmentFormData)[] = [
        "firstChoice",
        "secondChoice",
        "angkatan",
        "pddSubfocus",
        "fullName",
        "nim",
        "email",
        "phone",
        "instagram",
        "motivation",
        "experience",
        "portfolio",
      ];

      const isValidStrings = stringFields.every(
        (field) => typeof data[field] === "string",
      );

      const isValidAvailability =
        Array.isArray(data.availability) &&
        data.availability.every((value) => typeof value === "string");

      if (!isValidStrings || !isValidAvailability) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }

      let nextStep = 0;
      if (typeof storedStep === "number" && Number.isInteger(storedStep)) {
        const maxIndex = steps.length - 1;
        if (storedStep >= 0 && storedStep <= maxIndex) {
          nextStep = storedStep;
        }
      }

      setFormData({
        firstChoice: data.firstChoice,
        firstChoicePosition: data.firstChoicePosition || "",
        secondChoice: data.secondChoice,
        secondChoicePosition: data.secondChoicePosition || "",
        angkatan: data.angkatan || "",
        pddSubfocus: data.pddSubfocus || "",
        fullName: data.fullName,
        nim: data.nim,
        email: data.email,
        phone: data.phone,
        instagram: data.instagram,
        motivation: data.motivation,
        experience: data.experience,
        availability: data.availability,
        portfolio: data.portfolio,
      });

      setStep(nextStep);
      setShowRestoreNotice(true);
      setHasTouchedForm(true);
      setAutoSaveStatus("saved");
      setLastSavedAt(
        new Date(timestamp).toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (!shouldScrollOnStepChangeRef.current) return;
    shouldScrollOnStepChangeRef.current = false;
    if (typeof window === "undefined") return;
    const node = stepBarRef.current;
    if (!node) return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        const rect = node.getBoundingClientRect();
        const absoluteTop = rect.top + window.scrollY;
        const offset = window.innerWidth < 768 ? 100 : 140;
        window.scrollTo({
          top: absoluteTop - offset,
          behavior: "smooth",
        });
      }, 50);
    });
  }, [step]);

  useEffect(() => {
    if (!hasTouchedForm || submitted) return;
    if (typeof window === "undefined") return;

    setAutoSaveStatus("saving");

    const timeoutId = window.setTimeout(() => {
      try {
        const payload: StoredRecruitmentState = {
          data: formData,
          timestamp: Date.now(),
          step,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

        setAutoSaveStatus("saved");
        setLastSavedAt(
          new Date(payload.timestamp).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      } catch {
        setAutoSaveStatus("error");
      }
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [formData, hasTouchedForm, submitted, step]);

  useEffect(() => {
    if (!hasTouchedForm || submitted) return;
    if (typeof window === "undefined") return;

    const handleBeforeUnload = () => {
      try {
        const payload: StoredRecruitmentState = {
          data: formData,
          timestamp: Date.now(),
          step,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {}
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [formData, hasTouchedForm, submitted, step]);

  const clearStoredState = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const handleResetDraft = () => {
    setFormData({
      firstChoice: "",
      firstChoicePosition: "",
      secondChoice: "",
      secondChoicePosition: "",
      angkatan: "",
      pddSubfocus: "",
      fullName: "",
      nim: "",
      email: "",
      phone: "",
      instagram: "",
      motivation: "",
      experience: "",
      availability: [],
      portfolio: "",
    });
    setStep(0);
    setHasTouchedForm(false);
    setShowRestoreNotice(false);
    setAutoSaveStatus("idle");
    setLastSavedAt(null);
    clearStoredState();
    setShowResetConfirm(false);
  };

  // Drop restored choices whose division or position is no longer recruiting.
  useEffect(() => {
    if (!hasLiveDivisions) return;
    const isOpen = (divisionId: string, position: string) => {
      const division = divisions.find((d) => d.id === divisionId);
      if (!division) return { division: false, position: false };
      const positions = division.openPositions ?? [];
      return {
        division: true,
        position: !position || positions.includes(position),
      };
    };

    setFormData((prev) => {
      const first = isOpen(prev.firstChoice, prev.firstChoicePosition);
      const second = isOpen(prev.secondChoice, prev.secondChoicePosition);
      const next = { ...prev };
      if (prev.firstChoice && !first.division) {
        next.firstChoice = "";
        next.firstChoicePosition = "";
      } else if (!first.position) {
        next.firstChoicePosition = "";
      }
      if (prev.secondChoice && !second.division) {
        next.secondChoice = "";
        next.secondChoicePosition = "";
      } else if (!second.position) {
        next.secondChoicePosition = "";
      }
      const changed =
        next.firstChoice !== prev.firstChoice ||
        next.firstChoicePosition !== prev.firstChoicePosition ||
        next.secondChoice !== prev.secondChoice ||
        next.secondChoicePosition !== prev.secondChoicePosition;
      return changed ? next : prev;
    });
  }, [divisions, hasLiveDivisions]);

  const handleFirstChoiceChange = (divisionId: string) => {
    setFormData((prev) => ({
      ...prev,
      firstChoice: divisionId,
      firstChoicePosition: "", // Reset when division changes
      secondChoice: prev.secondChoice === divisionId ? "" : prev.secondChoice,
      secondChoicePosition:
        prev.secondChoice === divisionId ? "" : prev.secondChoicePosition,
      pddSubfocus:
        divisionId === "pdd" || prev.secondChoice === "pdd"
          ? prev.pddSubfocus
          : "",
    }));
    setHasTouchedForm(true);
  };

  const handleSecondChoiceChange = (divisionId: string) => {
    setFormData((prev) => ({
      ...prev,
      secondChoice: divisionId,
      secondChoicePosition: "", // Reset when division changes
      pddSubfocus:
        prev.firstChoice === "pdd" || divisionId === "pdd"
          ? prev.pddSubfocus
          : "",
    }));
    setHasTouchedForm(true);
  };

  const handleInputChange = (
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setHasTouchedForm(true);
  };

  const toggleAvailability = (value: string) => {
    setFormData((prev) => {
      const isActive = prev.availability.includes(value);
      const availability = isActive
        ? prev.availability.filter((item) => item !== value)
        : [...prev.availability, value];
      return { ...prev, availability };
    });
    setHasTouchedForm(true);
  };

  const scrollToFirstError = () => {
    if (!formContainerRef.current) return;
    requestAnimationFrame(() => {
      const firstError = formContainerRef.current?.querySelector(
        "[data-error='true']",
      );
      if (firstError) {
        const rect = firstError.getBoundingClientRect();
        const absoluteTop = rect.top + window.scrollY;
        const offset = window.innerWidth < 768 ? 120 : 160;
        window.scrollTo({
          top: absoluteTop - offset,
          behavior: "smooth",
        });
      }
    });
  };

  const handleNextWithValidation = (
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!isStepComplete(step)) {
      setShowStepErrors(true);
      setTimeout(scrollToFirstError, 50);
      return;
    }
    setShowStepErrors(false);
    shouldScrollOnStepChangeRef.current = true;
    setStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setShowStepErrors(false);
    shouldScrollOnStepChangeRef.current = true;
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (step < steps.length - 1) {
      handleNextWithValidation();
      return;
    }

    if (!isStepValid) return;

    if (step !== steps.length - 1) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      intent: "submit-pendaftaran",
      data: {
        firstChoice: formData.firstChoice,
        firstChoicePosition: formData.firstChoicePosition,
        secondChoice: formData.secondChoice,
        secondChoicePosition: formData.secondChoicePosition,
        angkatan: formData.angkatan,
        pddSubfocus: isPddSelected ? formData.pddSubfocus : "",
        fullName: trimmedFullName,
        nim: trimmedNim,
        email: trimmedEmail,
        phone: cleanPhone,
        instagram: formData.instagram.trim(),
        motivation: trimmedMotivation,
        experience: formData.experience.trim(),
        availability: formData.availability,
        portfolio: formData.portfolio.trim(),
        submittedAt: new Date().toISOString(),
      },
    };

    try {
      const response = await fetch("/api/pendaftaran", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message =
          "Gagal mengirim bukti pendaftaran. Coba lagi sebentar lagi.";
        try {
          const body = await response.json();
          if (body && typeof body.error === "string" && body.error.trim()) {
            message = body.error;
          }
        } catch {}
        setSubmitError(message);
        setIsSubmitting(false);
        return;
      }

      const submittedTime = new Date();
      setSubmittedAt(submittedTime);
      setSubmitted(true);
      setAutoSaveStatus("idle");
      setHasTouchedForm(false);
      setShowRestoreNotice(false);
      setLastSavedAt(null);
      clearStoredState();
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      }
    } catch {
      setSubmitError(
        "Terjadi kesalahan saat menghubungi server. Coba lagi sebentar lagi.",
      );
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="relative min-h-screen overflow-x-hidden px-6 pt-40 pb-32">
        <div
          data-animate="fade"
          className="pointer-events-none absolute inset-0 w-full bg-[radial-gradient(circle_at_top_right,rgba(212,166,77,0.03)_0%,transparent_70%)]"
        ></div>
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <div
            data-animate="up"
            className="mb-8 flex items-center justify-center gap-4"
          >
            <span
              className="bg-gold-500/40 block h-px w-8 md:w-12"
              aria-hidden="true"
            />
            <p className="text-gold-500 text-sm font-medium">
              Pendaftaran Terkirim
            </p>
            <span
              className="bg-gold-500/40 block h-px w-8 md:w-12"
              aria-hidden="true"
            />
          </div>
          <h1
            data-animate="up"
            data-animate-delay="0.08"
            className="mb-6 font-serif text-5xl tracking-tight text-white md:text-6xl"
          >
            Terima{" "}
            <span className="text-gold-500/80 font-light italic">Kasih</span>
          </h1>
          <p
            data-animate="up"
            data-animate-delay="0.16"
            className="mx-auto mb-4 max-w-2xl leading-relaxed font-light text-neutral-400"
          >
            Data pendaftaran sudah kami terima. Bukti pendaftaran telah kami
            kirim ke email{" "}
            <span className="text-gold-300">
              {formData.email || "yang kamu tulis di formulir"}
            </span>
            . Tim HIMA akan menghubungi kamu melalui kontak yang tertera untuk
            tahap berikutnya.
          </p>
          <div
            data-animate="up"
            data-animate-delay="0.2"
            className="mx-auto mb-12 max-w-xl text-sm text-neutral-500"
          >
            <p className="leading-relaxed">
              Jika email belum muncul di kotak masuk, cek juga folder{" "}
              <span className="text-neutral-300">Spam</span> atau{" "}
              <span className="text-neutral-300">Junk</span> dan tandai email
              dari <span className="text-gold-300">HIMA Musik</span> sebagai{" "}
              <span className="text-neutral-300">“Bukan spam”</span> supaya
              informasi berikutnya tidak terlewat.
            </p>
          </div>
          <div
            data-animate="up"
            data-animate-delay="0.25"
            className="mx-auto mb-10 max-w-lg border border-white/10 bg-white/5 p-6"
            style={{ borderRadius: "var(--radius-action)" }}
          >
            <p className="mb-2 text-sm font-medium text-neutral-400">
              Bukti Pendaftaran
            </p>
            <div className="space-y-2 text-sm text-neutral-200">
              <p>Nama: {formData.fullName}</p>
              <p>Email: {formData.email}</p>
              <p>
                Waktu:{" "}
                {submittedAt
                  ? submittedAt.toLocaleString("id-ID", {
                      dateStyle: "full",
                      timeStyle: "short",
                    })
                  : "-"}
              </p>
            </div>
          </div>
          <div
            data-animate="up"
            data-animate-delay="0.3"
            className="flex flex-col justify-center gap-4 md:flex-row"
          >
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setIsSubmitting(false);
                setSubmittedAt(null);
                setStep(0);
                setFormData({
                  firstChoice: "",
                  firstChoicePosition: "",
                  secondChoice: "",
                  secondChoicePosition: "",
                  angkatan: "",
                  pddSubfocus: "",
                  fullName: "",
                  nim: "",
                  email: "",
                  phone: "",
                  instagram: "",
                  motivation: "",
                  experience: "",
                  availability: [],
                  portfolio: "",
                });
              }}
              className="group hover:border-gold-300/50 relative overflow-hidden border border-white/10 bg-transparent px-8 py-4 text-sm font-medium text-white transition-all"
              style={{ borderRadius: "var(--radius-action)" }}
            >
              <span className="group-hover:text-gold-300 relative z-10 text-sm font-medium transition-colors duration-500">
                Daftar Lagi
              </span>
            </button>
            <Link
              href="/pendaftaran"
              className="group hover:bg-gold-300 relative overflow-hidden bg-white px-8 py-4 text-sm font-medium text-black transition-all hover:text-white"
              style={{ borderRadius: "var(--radius-action)" }}
            >
              Kembali ke Pendaftaran
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden px-6 pt-32 pb-40">
      <div
        data-animate="fade"
        className="pointer-events-none absolute inset-0 w-full bg-[radial-gradient(circle_at_top_left,rgba(212,166,77,0.03)_0%,transparent_70%)]"
      ></div>
      <div className="relative z-10 mx-auto max-w-6xl">
        <Link
          data-animate="up"
          data-animate-delay="0.05"
          href="/pendaftaran"
          className="hover:text-gold-300 mb-8 inline-flex items-center gap-2 text-sm text-neutral-500 transition-colors duration-300"
        >
          ← Kembali ke Info Pendaftaran
        </Link>

        <div data-animate="up" className="mb-8 flex items-center gap-4">
          <span
            className="bg-gold-500/40 block h-px w-8 md:w-12"
            aria-hidden="true"
          />
          <p className="text-gold-500 text-sm font-medium">
            Formulir Pendaftaran
          </p>
        </div>
        <div className="mb-12">
          <h1
            data-animate="up"
            data-animate-delay="0.1"
            className="mb-4 font-serif text-4xl tracking-tight text-white md:text-5xl"
          >
            Isi Data{" "}
            <span className="text-gold-500/80 font-light italic">
              Pendaftaran
            </span>
          </h1>
          <p
            data-animate="up"
            data-animate-delay="0.2"
            className="max-w-xl text-sm leading-relaxed text-neutral-400"
          >
            Pilih divisi, isi data diri, ceritakan motivasi, lalu kirim
            pendaftaran.
          </p>
        </div>

        <div
          ref={stepBarRef}
          data-animate="up"
          data-animate-delay="0.3"
          className="mb-12"
        >
          <div className="mb-4 flex items-center gap-3">
            <p className="text-gold-500 text-sm font-medium">
              Langkah {step + 1} dari {steps.length}: {steps[step].label}
            </p>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-neutral-900">
            <div
              className="bg-gold-500 h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            ></div>
          </div>
        </div>

        <form
          ref={formContainerRef}
          onSubmit={handleSubmit}
          data-animate-stagger="0.08"
          className="space-y-12"
        >
          {step === 0 && (
            <div data-animate="up" className="space-y-10">
              <div
                data-animate="up"
                className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
              >
                <div data-animate="up">
                  <h2 className="font-serif text-3xl tracking-tight text-white md:text-4xl">
                    Divisi apa yang paling kamu minati?
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-400">
                    Pilih divisi utama tempat kamu ingin berkontribusi.
                  </p>
                </div>
              </div>

              <div
                data-animate="up"
                data-animate-delay="0.08"
                className="flex flex-col gap-4 md:flex-row md:items-center"
              >
                <button
                  type="button"
                  onClick={() => setIsDivisionModalOpen(true)}
                  className="group border-gold-500/40 text-gold-300 hover:border-gold-500/60 relative overflow-hidden border bg-transparent px-6 py-3 text-sm font-medium transition-all"
                  style={{ borderRadius: "var(--radius-action)" }}
                >
                  <span className="group-hover:text-gold-200 relative z-10 flex items-center gap-2 transition-colors duration-500">
                    Lihat Panduan dan Tugas Divisi
                  </span>
                </button>
              </div>

              <div data-animate-stagger="0.08" className="space-y-8">
                <div data-animate="up" className="space-y-4">
                  <label className="block text-sm font-medium text-neutral-300">
                    Pilihan 1 (Wajib) <span className="text-gold-500">*</span>
                  </label>
                  <div className="space-y-3">
                    {divisions.map((division) => (
                      <div key={division.id} className="flex flex-col gap-2">
                        <div className="flex w-full items-center">
                          <input
                            type="radio"
                            id={`choice1-${division.id}`}
                            name="firstChoice"
                            value={division.id}
                            checked={formData.firstChoice === division.id}
                            onChange={(e) =>
                              handleFirstChoiceChange(e.target.value)
                            }
                            className="accent-gold-500 h-4 w-4 cursor-pointer"
                          />
                          <label
                            htmlFor={`choice1-${division.id}`}
                            className="ml-4 flex-1 cursor-pointer border border-white/10 bg-[#1a1a1a] px-4 py-3 transition-all duration-300 hover:border-white/20 hover:bg-[#222]"
                            style={{
                              borderRadius: "var(--radius-action)",
                              borderColor:
                                formData.firstChoice === division.id
                                  ? "rgba(212, 166, 77, 0.4)"
                                  : undefined,
                              backgroundColor:
                                formData.firstChoice === division.id
                                  ? "rgba(212, 166, 77, 0.08)"
                                  : undefined,
                            }}
                          >
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium text-white">
                                {division.name}
                              </span>
                              <span className="text-sm text-neutral-400">
                                {division.summary}
                              </span>
                            </div>
                          </label>
                        </div>
                        {formData.firstChoice === division.id &&
                          division.openPositions &&
                          division.openPositions.length > 0 && (
                            <div
                              className="relative mt-1 ml-8"
                              data-animate="fade"
                            >
                              <label className="mb-2 block text-xs font-medium text-neutral-400">
                                Jabatan <span className="text-gold-500">*</span>
                              </label>
                              <select
                                value={formData.firstChoicePosition}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    firstChoicePosition: e.target.value,
                                  }))
                                }
                                className="focus:border-gold-500 focus:ring-gold-500 w-full appearance-none border border-white/10 bg-[#1a1a1a] px-4 py-2 text-sm text-neutral-200 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                                style={{ borderRadius: "var(--radius-action)" }}
                              >
                                <option
                                  value=""
                                  disabled
                                  className="bg-[#111] text-neutral-400"
                                >
                                  -- Pilih Jabatan --
                                </option>
                                {division.openPositions.map((pos) => (
                                  <option
                                    key={pos}
                                    value={pos}
                                    className="bg-[#111] text-neutral-300"
                                  >
                                    {pos}
                                  </option>
                                ))}
                              </select>
                              <div className="text-gold-500/60 pointer-events-none absolute top-6 right-0 bottom-0 flex items-center pr-3 transition-colors duration-300">
                                <IconChevronDown />
                              </div>
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                  {showStepErrors &&
                    (!formData.firstChoice ||
                      (!formData.firstChoicePosition &&
                        divisions.find((d) => d.id === formData.firstChoice)
                          ?.openPositions?.length)) && (
                      <p
                        data-error="true"
                        className="mt-2 text-sm text-amber-500/80"
                      >
                        Pilih divisi dan jabatan utama terlebih dahulu.
                      </p>
                    )}
                </div>

                <div data-animate="up" className="space-y-4">
                  <label
                    htmlFor="secondChoice"
                    className="block text-sm font-medium text-neutral-300"
                  >
                    Pilihan 2 (Opsional)
                  </label>
                  <div className="relative">
                    <select
                      id="secondChoice"
                      name="secondChoice"
                      value={formData.secondChoice}
                      onChange={(e) => handleSecondChoiceChange(e.target.value)}
                      className="focus:border-gold-500 focus:ring-gold-500 w-full appearance-none border border-white/10 bg-[#1a1a1a] px-4 py-3 text-base text-neutral-200 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                      style={{ borderRadius: "var(--radius-action)" }}
                    >
                      <option className="bg-[#111] text-neutral-300" value="">
                        — Tidak ada / Hanya fokus pada Pilihan 1 —
                      </option>
                      {divisions.map((division) => (
                        <option
                          key={division.id}
                          value={division.id}
                          disabled={division.id === formData.firstChoice}
                          className="bg-[#111] text-neutral-300"
                        >
                          {division.name}
                          {division.id === formData.firstChoice
                            ? " (dipilih sebagai Pilihan 1)"
                            : ""}
                        </option>
                      ))}
                    </select>
                    <div className="text-gold-500/60 pointer-events-none absolute top-0 right-0 bottom-0 flex items-center pr-4 transition-colors duration-300">
                      <IconChevronDown />
                    </div>
                  </div>
                  {formData.secondChoice && (
                    <div className="relative mt-3" data-animate="fade">
                      <label className="mb-2 block text-xs font-medium text-neutral-400">
                        Jabatan <span className="text-gold-500">*</span>
                      </label>
                      <select
                        value={formData.secondChoicePosition}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            secondChoicePosition: e.target.value,
                          }))
                        }
                        className="focus:border-gold-500 focus:ring-gold-500 w-full appearance-none border border-white/10 bg-[#1a1a1a] px-4 py-2 text-sm text-neutral-200 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                        style={{ borderRadius: "var(--radius-action)" }}
                      >
                        <option
                          value=""
                          disabled
                          className="bg-[#111] text-neutral-400"
                        >
                          -- Pilih Jabatan --
                        </option>
                        {divisions
                          .find((d) => d.id === formData.secondChoice)
                          ?.openPositions?.map((pos) => (
                            <option
                              key={pos}
                              value={pos}
                              className="bg-[#111] text-neutral-300"
                            >
                              {pos}
                            </option>
                          ))}
                      </select>
                      <div className="text-gold-500/60 pointer-events-none absolute top-6 right-0 bottom-0 flex items-center pr-3 transition-colors duration-300">
                        <IconChevronDown />
                      </div>
                    </div>
                  )}
                  {showStepErrors &&
                    formData.secondChoice &&
                    !formData.secondChoicePosition &&
                    divisions.find((d) => d.id === formData.secondChoice)
                      ?.openPositions?.length && (
                      <p
                        data-error="true"
                        className="mt-2 text-sm text-amber-500/80"
                      >
                        Pilih jabatan untuk divisi Pilihan 2.
                      </p>
                    )}
                  <p className="mt-2 text-sm text-neutral-500">
                    Pilihan 2 tidak dapat sama dengan Pilihan 1.
                  </p>
                </div>

                <div data-animate="up" className="space-y-4">
                  <label
                    htmlFor="angkatan"
                    className="block text-sm font-medium text-neutral-300"
                  >
                    Angkatan <span className="text-gold-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="angkatan"
                      name="angkatan"
                      value={formData.angkatan}
                      onChange={handleInputChange}
                      className="focus:border-gold-500 focus:ring-gold-500 w-full appearance-none border border-white/10 bg-[#1a1a1a] px-4 py-3 text-base text-neutral-200 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                      style={{ borderRadius: "var(--radius-action)" }}
                    >
                      <option className="bg-[#111] text-neutral-300" value="">
                        — Pilih angkatan —
                      </option>
                      {angkatanList.map((year) => (
                        <option
                          key={year}
                          className="bg-[#111] text-neutral-300"
                          value={year}
                        >
                          {year}
                        </option>
                      ))}
                    </select>
                    <div className="text-gold-500/60 pointer-events-none absolute top-0 right-0 bottom-0 flex items-center pr-4 transition-colors duration-300">
                      <IconChevronDown />
                    </div>
                  </div>
                  {showStepErrors && angkatanError && (
                    <p
                      data-error="true"
                      className="mt-2 text-sm text-amber-500/80"
                    >
                      {angkatanError}
                    </p>
                  )}
                  {juniorPositionError && (
                    <p
                      data-error="true"
                      role="alert"
                      className="mt-2 text-sm text-amber-500/80"
                    >
                      {juniorPositionError}
                    </p>
                  )}
                </div>

                {isPddSelected && (
                  <div data-animate="up" className="space-y-4">
                    <label className="block text-sm font-medium text-neutral-300">
                      Sub-fokus PDD (Opsional)
                    </label>
                    <p className="text-sm text-neutral-500">
                      Sub-fokus mana yang paling sesuai dengan skill-mu?
                    </p>
                    <div className="space-y-3">
                      {[
                        {
                          value: "desain",
                          label: "Desain",
                          desc: "Visual identity, poster, feed IG, template, brand guideline",
                        },
                        {
                          value: "publikasi",
                          label: "Publikasi & Media Sosial",
                          desc: "Content calendar, distribusi info, kelola platform",
                        },
                        {
                          value: "dokumentasi",
                          label: "Dokumentasi",
                          desc: "Fotografer/videografer, seleksi & arsip, aftermovie",
                        },
                      ].map((option) => (
                        <div key={option.value} className="flex items-center">
                          <input
                            type="radio"
                            id={`pdd-${option.value}`}
                            name="pddSubfocus"
                            value={option.value}
                            checked={formData.pddSubfocus === option.value}
                            onChange={handleInputChange}
                            className="accent-gold-500 h-4 w-4 cursor-pointer"
                          />
                          <label
                            htmlFor={`pdd-${option.value}`}
                            className="ml-4 flex-1 cursor-pointer border border-white/10 bg-[#1a1a1a] px-4 py-3 transition-all duration-300 hover:border-white/20 hover:bg-[#222]"
                            style={{
                              borderRadius: "var(--radius-action)",
                              borderColor:
                                formData.pddSubfocus === option.value
                                  ? "rgba(212, 166, 77, 0.4)"
                                  : undefined,
                              backgroundColor:
                                formData.pddSubfocus === option.value
                                  ? "rgba(212, 166, 77, 0.05)"
                                  : undefined,
                            }}
                          >
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium text-white">
                                {option.label}
                              </span>
                              <span className="text-sm text-neutral-400">
                                {option.desc}
                              </span>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div data-animate="up" className="space-y-10">
              <div data-animate="up">
                <h2 className="font-serif text-3xl tracking-tight text-white md:text-4xl">
                  Data Diri
                </h2>
              </div>

              <div
                data-animate-stagger="0.08"
                className="grid grid-cols-1 gap-10 md:grid-cols-2"
              >
                <div data-animate="up" className="group relative">
                  <label className="group-focus-within:text-gold-300 mb-3 block text-sm font-medium text-neutral-300 transition-colors duration-300">
                    Nama Lengkap <span className="text-gold-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      className="focus:border-gold-500 focus:ring-gold-500 w-full border border-white/10 bg-[#1a1a1a] px-4 py-3 text-base text-neutral-200 placeholder-neutral-500 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                      style={{ borderRadius: "var(--radius-action)" }}
                      placeholder="Nama sesuai KTM"
                      required
                    />
                    {trimmedFullName && (
                      <span className="absolute right-3 text-sm text-green-500">
                        OK
                      </span>
                    )}
                  </div>
                  {showStepErrors && fullNameError && (
                    <p
                      data-error="true"
                      className="mt-2 text-sm text-amber-500/80"
                    >
                      {fullNameError}
                    </p>
                  )}
                </div>
                <div data-animate="up" className="group relative">
                  <label className="group-focus-within:text-gold-300 mb-3 block text-sm font-medium text-neutral-300 transition-colors duration-300">
                    NIM <span className="text-gold-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      name="nim"
                      value={formData.nim}
                      onChange={handleInputChange}
                      className="focus:border-gold-500 focus:ring-gold-500 w-full border border-white/10 bg-[#1a1a1a] px-4 py-3 text-base text-neutral-200 placeholder-neutral-500 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                      style={{ borderRadius: "var(--radius-action)" }}
                      placeholder="24xxxxxxxx"
                      inputMode="numeric"
                      pattern="\d{10,12}"
                      required
                    />
                    {trimmedNim && isNimValid && (
                      <span className="absolute right-3 text-sm text-green-500">
                        OK
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-neutral-500">
                    10–12 digit angka sesuai KTM
                  </p>
                  {showStepErrors && nimError && (
                    <p
                      data-error="true"
                      className="mt-2 text-sm text-amber-500/80"
                    >
                      {nimError}
                    </p>
                  )}
                </div>
                <div data-animate="up" className="group relative">
                  <label className="group-focus-within:text-gold-300 mb-3 block text-sm font-medium text-neutral-300 transition-colors duration-300">
                    Email Aktif <span className="text-gold-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="focus:border-gold-500 focus:ring-gold-500 w-full border border-white/10 bg-[#1a1a1a] px-4 py-3 text-base text-neutral-200 placeholder-neutral-500 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                      style={{ borderRadius: "var(--radius-action)" }}
                      placeholder="nama@email.com"
                      required
                    />
                    {trimmedEmail && isEmailValid && (
                      <span className="absolute right-3 text-sm text-green-500">
                        OK
                      </span>
                    )}
                  </div>
                  {showStepErrors && emailError && (
                    <p
                      data-error="true"
                      className="mt-2 text-sm text-amber-500/80"
                    >
                      {emailError}
                    </p>
                  )}
                </div>
                <div data-animate="up" className="group relative">
                  <label className="group-focus-within:text-gold-300 mb-3 block text-sm font-medium text-neutral-300 transition-colors duration-300">
                    No. WhatsApp <span className="text-gold-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="focus:border-gold-500 focus:ring-gold-500 w-full border border-white/10 bg-[#1a1a1a] px-4 py-3 text-base text-neutral-200 placeholder-neutral-500 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                      style={{ borderRadius: "var(--radius-action)" }}
                      placeholder="08xxxxxxxxxx"
                      inputMode="tel"
                      required
                    />
                    {trimmedPhone && isPhoneValid && (
                      <span className="absolute right-3 text-sm text-green-500">
                        OK
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-neutral-500">
                    Format: 08xx atau +628xx (spasi/strip diabaikan)
                  </p>
                  {showStepErrors && phoneError && (
                    <p
                      data-error="true"
                      className="mt-2 text-sm text-amber-500/80"
                    >
                      {phoneError}
                    </p>
                  )}
                </div>
                <div data-animate="up" className="group relative">
                  <label className="group-focus-within:text-gold-300 mb-3 block text-sm font-medium text-neutral-300 transition-colors duration-300">
                    Instagram (Opsional)
                  </label>
                  <input
                    type="text"
                    name="instagram"
                    value={formData.instagram}
                    onChange={handleInputChange}
                    className="focus:border-gold-500 focus:ring-gold-500 w-full border border-white/10 bg-[#1a1a1a] px-4 py-3 text-base text-neutral-200 placeholder-neutral-500 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                    style={{ borderRadius: "var(--radius-action)" }}
                    placeholder="@username"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div data-animate="up" className="space-y-10">
              <div data-animate="up">
                <h2 className="font-serif text-3xl tracking-tight text-white md:text-4xl">
                  Motivasi & Ketersediaan
                </h2>
              </div>

              <div data-animate-stagger="0.08" className="space-y-10">
                <div data-animate="up" className="group relative">
                  <label className="group-focus-within:text-gold-300 mb-3 block text-sm font-medium text-neutral-300 transition-colors duration-300">
                    Motivasi Utama <span className="text-gold-500">*</span>
                  </label>
                  <textarea
                    name="motivation"
                    value={formData.motivation}
                    onChange={handleInputChange}
                    rows={6}
                    maxLength={MAX_MOTIVATION_CHARS}
                    className="focus:border-gold-500 focus:ring-gold-500 w-full resize-none overflow-hidden border border-white/10 bg-[#1a1a1a] px-4 py-3 text-base text-neutral-200 placeholder-neutral-500 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                    style={{
                      overflowWrap: "break-word",
                      borderRadius: "var(--radius-action)",
                    }}
                    placeholder={`Contoh: Kenapa kamu tertarik dengan ${currentDivision ? currentDivision.name : "divisi ini"}? Apa yang ingin kamu pelajari atau ubah di HIMA Musik?`}
                  ></textarea>
                  <div className="mt-3 space-y-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-900">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          motivationLength >= MIN_MOTIVATION_CHARS
                            ? "bg-green-500"
                            : motivationLength >= MIN_MOTIVATION_CHARS - 30
                              ? "bg-amber-500"
                              : "bg-neutral-700"
                        }`}
                        style={{
                          width: `${(motivationLength / MAX_MOTIVATION_CHARS) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span
                        className={
                          motivationLength >= MIN_MOTIVATION_CHARS
                            ? "text-green-500"
                            : motivationLength > 0
                              ? "text-neutral-500"
                              : "text-neutral-700"
                        }
                      >
                        {motivationLength >= MIN_MOTIVATION_CHARS
                          ? "Penjelasanmu sudah cukup detail."
                          : `${MIN_MOTIVATION_CHARS - motivationLength} karakter lagi`}
                      </span>
                      <span className="text-neutral-500">
                        {motivationLength}/{MAX_MOTIVATION_CHARS}
                      </span>
                    </div>
                  </div>
                  {showStepErrors && motivationError && (
                    <p
                      data-error="true"
                      className="mt-3 text-sm text-amber-500/80"
                    >
                      {motivationError}
                    </p>
                  )}
                </div>

                <div data-animate="up" className="group relative">
                  <label className="group-focus-within:text-gold-300 mb-4 block text-sm font-medium text-neutral-300 transition-colors duration-300">
                    Ketersediaan Waktu <span className="text-gold-500">*</span>
                  </label>
                  <p className="mb-4 text-sm text-neutral-500">
                    Pilih hari di mana kamu biasanya luang untuk
                    rapat/koordinasi (Bisa pilih lebih dari satu).
                  </p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {availabilityOptions.map((day) => {
                      const isActive = formData.availability.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleAvailability(day)}
                          className={`border px-4 py-3 text-sm font-medium transition-all duration-300 ${
                            isActive
                              ? "border-gold-500/60 text-gold-300 bg-gold-500/10"
                              : "border-white/10 text-neutral-400 hover:border-white/30 hover:bg-white/5 hover:text-white"
                          }`}
                          style={{ borderRadius: "var(--radius-action)" }}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  {showStepErrors && formData.availability.length === 0 && (
                    <p
                      data-error="true"
                      className="mt-3 text-sm text-amber-500/80"
                    >
                      Pilih minimal satu hari untuk rapat rutin.
                    </p>
                  )}
                </div>

                <div data-animate="up" className="group relative">
                  <label className="group-focus-within:text-gold-300 mb-3 block text-sm font-medium text-neutral-300 transition-colors duration-300">
                    Pengalaman Organisasi (Opsional)
                  </label>
                  <textarea
                    name="experience"
                    value={formData.experience}
                    onChange={handleInputChange}
                    rows={4}
                    className="focus:border-gold-500 focus:ring-gold-500 w-full resize-none overflow-hidden border border-white/10 bg-[#1a1a1a] px-4 py-3 text-base text-neutral-200 placeholder-neutral-500 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                    style={{
                      overflowWrap: "break-word",
                      borderRadius: "var(--radius-action)",
                    }}
                    placeholder="Cerita singkat pengalaman organisasi atau proyek yang pernah kamu ikuti."
                  ></textarea>
                </div>

                <div data-animate="up" className="group relative">
                  <label className="group-focus-within:text-gold-300 mb-3 block text-sm font-medium text-neutral-300 transition-colors duration-300">
                    Portofolio/Link Karya (Opsional)
                  </label>
                  <textarea
                    name="portfolio"
                    value={formData.portfolio}
                    onChange={handleInputChange}
                    rows={3}
                    className="focus:border-gold-500 focus:ring-gold-500 w-full resize-none overflow-hidden border border-white/10 bg-[#1a1a1a] px-4 py-3 text-base text-neutral-200 placeholder-neutral-500 transition-colors duration-300 focus:bg-[#222] focus:ring-1 focus:outline-none"
                    style={{
                      overflowWrap: "break-word",
                      borderRadius: "var(--radius-action)",
                    }}
                    placeholder="Behance, Drive, Instagram, YouTube, dsb."
                  ></textarea>
                  <p className="mt-2 text-sm text-neutral-500">
                    Boleh lebih dari satu link, pisahkan dengan koma atau baris
                    baru.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div data-animate="up" className="space-y-10">
              <div data-animate="up">
                <h2 className="font-serif text-3xl tracking-tight text-white md:text-4xl">
                  Review Pendaftaran
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-400">
                  Satu langkah lagi! Pastikan data di atas sudah benar sebelum
                  dikirim.
                </p>
              </div>

              <div
                data-animate-stagger="0.08"
                className="grid grid-cols-1 gap-8 lg:grid-cols-2"
              >
                <div
                  data-animate="up"
                  className="space-y-6 overflow-hidden border border-white/5 bg-white/2 p-8"
                  style={{ overflowWrap: "break-word" }}
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-neutral-400">
                        Posisi Pilihan
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowStepErrors(false);
                          shouldScrollOnStepChangeRef.current = true;
                          setStep(0);
                        }}
                        className="text-gold-500/70 hover:text-gold-300 text-sm font-medium transition-colors duration-300"
                      >
                        Edit
                      </button>
                    </div>
                    <p className="font-serif text-2xl text-white">
                      {divisions.find(
                        (division) => division.id === formData.firstChoice,
                      )?.name || "-"}
                      {formData.firstChoicePosition
                        ? ` - ${formData.firstChoicePosition}`
                        : ""}
                    </p>
                    <p className="mt-2 text-sm text-neutral-400">
                      Pilihan 2:{" "}
                      {divisions.find(
                        (division) => division.id === formData.secondChoice,
                      )?.name || "—"}
                      {formData.secondChoicePosition
                        ? ` - ${formData.secondChoicePosition}`
                        : ""}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      Angkatan: {formData.angkatan || "—"}
                    </p>
                    {isPddSelected && formData.pddSubfocus && (
                      <p className="mt-1 text-sm text-neutral-400">
                        Sub-fokus PDD:{" "}
                        {formData.pddSubfocus === "desain"
                          ? "Desain"
                          : formData.pddSubfocus === "publikasi"
                            ? "Publikasi & Media Sosial"
                            : formData.pddSubfocus === "dokumentasi"
                              ? "Dokumentasi"
                              : "—"}
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-neutral-400">
                        Kontak
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowStepErrors(false);
                          shouldScrollOnStepChangeRef.current = true;
                          setStep(1);
                        }}
                        className="text-gold-500/70 hover:text-gold-300 text-sm font-medium transition-colors duration-300"
                      >
                        Edit
                      </button>
                    </div>
                    <div
                      className="space-y-2 overflow-hidden text-sm text-neutral-300"
                      style={{ overflowWrap: "break-word" }}
                    >
                      <p
                        className="overflow-hidden"
                        style={{ overflowWrap: "break-word" }}
                      >
                        {formData.fullName}
                      </p>
                      <p
                        className="overflow-hidden"
                        style={{ overflowWrap: "break-word" }}
                      >
                        {formData.nim}
                      </p>
                      <p
                        className="overflow-hidden text-sm"
                        style={{ overflowWrap: "break-word" }}
                      >
                        {formData.email}
                      </p>
                      <p
                        className="overflow-hidden"
                        style={{ overflowWrap: "break-word" }}
                      >
                        {formData.phone}
                      </p>
                      {formData.instagram && (
                        <p
                          className="overflow-hidden"
                          style={{ overflowWrap: "break-word" }}
                        >
                          {formData.instagram}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  data-animate="up"
                  className="space-y-6 overflow-hidden border border-white/5 bg-white/2 p-8"
                  style={{ overflowWrap: "break-word" }}
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-neutral-400">
                        Motivasi
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowStepErrors(false);
                          shouldScrollOnStepChangeRef.current = true;
                          setStep(2);
                        }}
                        className="text-gold-500/70 hover:text-gold-300 text-sm font-medium transition-colors duration-300"
                      >
                        Edit
                      </button>
                    </div>
                    <p
                      className="overflow-hidden text-sm leading-relaxed whitespace-pre-wrap text-neutral-300"
                      style={{ overflowWrap: "break-word" }}
                    >
                      {formData.motivation || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-neutral-400">
                      Ketersediaan
                    </p>
                    <p className="text-sm text-neutral-300">
                      {formData.availability.length > 0
                        ? formData.availability.join(", ")
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-neutral-400">
                      Pengalaman
                    </p>
                    <p
                      className="overflow-hidden text-sm leading-relaxed whitespace-pre-wrap text-neutral-300"
                      style={{ overflowWrap: "break-word" }}
                    >
                      {formData.experience || "Belum diisi"}
                    </p>
                  </div>
                  {formData.portfolio && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-neutral-400">
                        Portofolio
                      </p>
                      <div
                        className="space-y-1 overflow-hidden text-sm text-neutral-300"
                        style={{ overflowWrap: "break-word" }}
                      >
                        {formData.portfolio
                          .split(/[\n,]+/)
                          .map((entry) => entry.trim())
                          .filter(Boolean)
                          .map((entry) => (
                            <p
                              key={entry}
                              className="overflow-hidden text-sm"
                              style={{ overflowWrap: "break-word" }}
                            >
                              {entry}
                            </p>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div
            data-animate="up"
            className="flex flex-col justify-between gap-6 border-t border-white/5 pt-8 md:flex-row md:items-center"
          >
            <div className="flex flex-col gap-2 text-sm text-neutral-500">
              {(hasEditedCurrentStep || showStepErrors) && (
                <span
                  className={
                    isStepValid
                      ? "text-gold-400 inline-flex items-center gap-2"
                      : "inline-flex items-center gap-2 text-red-400"
                  }
                >
                  <span className="text-sm">{isStepValid ? "OK" : "!"}</span>
                  <span>
                    {isStepValid
                      ? step === steps.length - 1
                        ? "Review semua data sebelum mengirim"
                        : "Lengkapi langkah berikutnya"
                      : step === 2
                        ? !trimmedMotivation
                          ? "Isi motivasi untuk melanjutkan"
                          : !isMotivationValid
                            ? "Motivasi belum memenuhi batas karakter"
                            : formData.availability.length === 0
                              ? "Pilih minimal satu ketersediaan waktu"
                              : "Lengkapi motivasi dan ketersediaan"
                        : step === 1
                          ? "Periksa kembali data diri yang belum valid"
                          : "Pilih divisi dan angkatan untuk melanjutkan"}
                  </span>
                </span>
              )}
              {(hasTouchedForm ||
                showRestoreNotice ||
                autoSaveStatus === "error") && (
                <span>
                  {autoSaveStatus === "saving" && "Menyimpan draf..."}
                  {autoSaveStatus === "saved" &&
                    lastSavedAt &&
                    `Draf tersimpan di perangkat ini \u2022 ${lastSavedAt}`}
                  {autoSaveStatus === "error" &&
                    "Gagal menyimpan draf. Periksa penyimpanan browser."}
                  {autoSaveStatus === "idle" &&
                    showRestoreNotice &&
                    "Draf sebelumnya dipulihkan dari perangkat ini."}
                </span>
              )}
              {submitError && (
                <span className="text-red-400">{submitError}</span>
              )}
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              {step > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="border border-white/10 px-6 py-3 text-sm font-medium text-neutral-400 transition-colors duration-300 hover:border-white/30 hover:text-white"
                  style={{ borderRadius: "var(--radius-action)" }}
                >
                  Kembali
                </button>
              )}
              {hasTouchedForm && (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="border border-white/10 px-4 py-2 text-sm text-neutral-400 transition-colors duration-300 hover:border-red-400/40 hover:text-red-400"
                  style={{ borderRadius: "var(--radius-action)" }}
                >
                  Reset Draf
                </button>
              )}
              {step < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNextWithValidation}
                  className="btn-primary"
                >
                  Lanjut
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!isStepValid || isSubmitting}
                  className={`btn-primary ${!isStepValid || isSubmitting ? "pointer-events-none opacity-60" : ""}`}
                >
                  {isSubmitting ? "Mengirim..." : "Kirim Pendaftaran"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
      {showResetConfirm && (
        <div
          data-animate="fade"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]/90 px-6 backdrop-blur-sm"
        >
          <div
            data-animate="up"
            className="relative w-full max-w-md overflow-hidden border border-white/10 bg-[#111] p-8"
          >
            <div className="via-gold-500/50 absolute top-0 left-0 h-px w-full bg-linear-to-r from-transparent to-transparent"></div>
            <h2 className="mb-4 font-serif text-2xl tracking-wide text-white">
              Reset draf?
            </h2>
            <p className="mb-10 text-sm leading-relaxed font-light text-neutral-400">
              Tindakan ini akan menghapus semua isian formulir pendaftaran yang
              belum dikirim.
            </p>
            <div className="flex justify-end gap-4 text-sm font-medium">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="border border-white/10 px-6 py-3 text-neutral-400 transition-colors duration-300 hover:border-white/30 hover:text-white"
                style={{ borderRadius: "var(--radius-action)" }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResetDraft}
                className="hover:bg-gold-300 bg-white px-6 py-3 text-black transition-colors duration-300 hover:text-white"
                style={{ borderRadius: "var(--radius-action)" }}
              >
                Ya, reset
              </button>
            </div>
          </div>
        </div>
      )}

      {isDivisionModalOpen && (
        <div
          data-animate="fade"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0a0a0a]/90 px-6 py-12 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsDivisionModalOpen(false);
            }
          }}
        >
          <div
            data-animate="up"
            className="relative w-full max-w-4xl overflow-hidden border border-white/10 bg-[#111]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="via-gold-500/50 absolute top-0 left-0 h-px w-full bg-linear-to-r from-transparent to-transparent"></div>
            <button
              type="button"
              onClick={() => setIsDivisionModalOpen(false)}
              className="absolute top-6 right-6 z-10 text-2xl leading-none text-neutral-500 transition-colors hover:text-white"
              aria-label="Tutup modal"
            >
              X
            </button>

            <div className="p-8 md:p-12">
              <h2 className="mb-2 font-serif text-4xl tracking-tight text-white">
                Panduan Lengkap Divisi
              </h2>
              <p className="mb-12 text-sm text-neutral-400">
                Pelajari detail setiap divisi untuk memilih yang paling cocok
                dengan minat dan keahlianmu.
              </p>

              <div data-animate-stagger="0.08" className="space-y-8">
                {divisions.map((division) => (
                  <div
                    key={division.id}
                    data-animate="up"
                    className="border border-white/10 bg-white/2 p-8"
                  >
                    <div className="mb-6">
                      <h3 className="mb-2 font-serif text-2xl text-white">
                        {division.name}
                      </h3>
                      <p className="text-gold-500/80 mb-4 text-sm font-medium">
                        Fokus: {division.focus}
                      </p>
                      <p className="text-sm leading-relaxed text-neutral-400">
                        {division.summary}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                      <div>
                        <h4 className="mb-3 text-sm font-medium text-neutral-300">
                          Tugas Utama
                        </h4>
                        <ul className="space-y-2 text-sm text-neutral-300">
                          {division.tasks.map((task) => (
                            <li key={task} className="flex gap-3">
                              <span className="text-gold-500 shrink-0">•</span>
                              <span>{task}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="mb-3 text-sm font-medium text-neutral-300">
                          Skill Ideal & Komitmen
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <p className="mb-2 text-sm text-neutral-500">
                              Skill:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {division.skills.map((skill) => (
                                <span
                                  key={skill}
                                  className="border-gold-500/30 bg-gold-500/5 text-gold-300 border px-3 py-1 text-sm"
                                  style={{
                                    borderRadius: "var(--radius-action)",
                                  }}
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 text-sm text-neutral-500">
                              Komitmen Waktu:
                            </p>
                            <p className="text-sm text-neutral-300">
                              {division.commitment}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div data-animate="up" className="mt-12 text-center">
                <button
                  type="button"
                  onClick={() => setIsDivisionModalOpen(false)}
                  className="group hover:bg-gold-300 relative overflow-hidden bg-white px-8 py-3 text-sm font-medium text-black transition-all"
                  style={{ borderRadius: "var(--radius-action)" }}
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
