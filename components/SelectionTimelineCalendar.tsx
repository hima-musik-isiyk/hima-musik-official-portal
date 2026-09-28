"use client";

import { AnimatePresence, motion } from "motion/react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { getCmsGsapEasing, gsap } from "@/lib/gsap";
import type { RecruitmentTimelineData } from "@/lib/notion";

import { IconCalendar, IconClock, IconInfo } from "./Icons";

const DAYS_OF_WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

interface Event {
  title: string;
  dateStr: string;
  startTime?: string;
  endTime?: string;
  description: string;
  type:
    | "registration"
    | "interview-announcement"
    | "interview"
    | "final-announcement";
  start: Date;
  end: Date;
}

interface SelectionTimelineCalendarProps {
  currentYear?: string;
  currentBatch?: string;
  timelineData?: RecruitmentTimelineData | null;
}

interface TimelineConfig {
  batch: string;
  year: string;
  events: Event[];
}

const SELECTION_TIMELINES: TimelineConfig[] = [
  {
    batch: "1",
    year: "2026",
    events: [
      {
        title: "Pendaftaran",
        dateStr: "27 Feb – 03 Mar",
        description: "Deadline: 15:00 WIB. Pastikan data diri sudah sesuai.",
        type: "registration",
        start: new Date("2026-02-27"),
        end: new Date("2026-03-03T15:00:00"),
        endTime: "15:00",
      },
      {
        title: "Pengumuman Wawancara",
        dateStr: "03 Mar",
        description: "Pukul 18:00 WIB via kanal resmi HIMA Musik.",
        type: "interview-announcement",
        start: new Date("2026-03-03T18:00:00"),
        end: new Date("2026-03-03T18:00:00"),
        startTime: "18:00",
      },
      {
        title: "Wawancara",
        dateStr: "04 Mar",
        description: "Waktu menyusul. Siapkan visi dan portofolio terbaikmu.",
        type: "interview",
        start: new Date("2026-03-04"),
        end: new Date("2026-03-04"),
      },
      {
        title: "Pengumuman Akhir",
        dateStr: "10 Mar",
        description: "Selamat bergabung di keluarga besar HIMA Musik!",
        type: "final-announcement",
        start: new Date("2026-03-10"),
        end: new Date("2026-03-10"),
      },
    ],
  },
  {
    batch: "2",
    year: "2026",
    events: [
      {
        title: "Pendaftaran",
        dateStr: "27 Feb – 10 Mar",
        description: "Deadline: 15:00 WIB. Pastikan data diri sudah sesuai.",
        type: "registration",
        start: new Date("2026-02-27"),
        end: new Date("2026-03-10T15:00:00"),
        endTime: "15:00",
      },
      {
        title: "Wawancara",
        dateStr: "11 Mar",
        description: "Siapkan visi dan portofolio terbaikmu.",
        type: "interview",
        start: new Date("2026-03-11"),
        end: new Date("2026-03-11"),
      },
      {
        title: "Pengumuman Akhir",
        dateStr: "13 Mar",
        description: "Selamat bergabung di kepengurusan HIMA Musik!",
        type: "final-announcement",
        start: new Date("2026-03-13"),
        end: new Date("2026-03-13"),
      },
    ],
  },
];

const getDateOnly = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getCalendarStart = (date: Date) => {
  const start = getDateOnly(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
};

const getCalendarDays = (events: Event[]) => {
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  if (!firstEvent || !lastEvent) return [];

  const start = getCalendarStart(firstEvent.start);
  const end = getDateOnly(lastEvent.end);
  const sundayOffset = (7 - end.getDay()) % 7;
  end.setDate(end.getDate() + sundayOffset);

  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

const formatPeriod = (events: Event[]) => {
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  if (!firstEvent || !lastEvent) return "";

  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `${formatter.format(firstEvent.start)} – ${formatter.format(lastEvent.end)}`;
};

const formatTimelineDateStr = (start: Date, end: Date) => {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  });
  const startLabel = formatter.format(start);
  const endLabel = formatter.format(end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
};

const SelectionTimelineCalendar: React.FC<SelectionTimelineCalendarProps> = ({
  currentYear,
  currentBatch,
  timelineData,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // When Notion timelineData is provided, use its batch/year as the active values.
  // This prevents a mismatch when cmsVariables.CURRENT_BATCH/YEAR are missing or stale.
  const activeYear =
    (timelineData !== undefined && timelineData !== null
      ? timelineData.year?.trim()
      : undefined) ||
    currentYear?.trim() ||
    "2026";
  const activeBatch =
    (timelineData !== undefined && timelineData !== null
      ? timelineData.batch?.trim()
      : undefined) ||
    currentBatch?.trim() ||
    "1";

  const timelineConfigs = useMemo<TimelineConfig[]>(() => {
    if (timelineData === undefined) return SELECTION_TIMELINES;
    if (timelineData === null) return [];

    const mappedEvents: Event[] = timelineData.events.map((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      return {
        title: event.title,
        dateStr: formatTimelineDateStr(start, end),
        startTime: event.startTime,
        endTime: event.endTime,
        description: event.description,
        type: event.type,
        start,
        end,
      };
    });
    return [
      {
        batch: timelineData.batch?.trim() || activeBatch,
        year: timelineData.year?.trim() || activeYear,
        events: mappedEvents,
      },
    ];
  }, [activeBatch, activeYear, timelineData]);

  // When timelineData is provided, use the first (and only) config directly
  // instead of finding by batch/year to avoid cache-mismatch failures.
  const activeTimeline = useMemo(
    () =>
      timelineData !== undefined
        ? timelineConfigs[0]
        : timelineConfigs.find(
            (item) => item.year === activeYear && item.batch === activeBatch,
          ),
    [activeYear, activeBatch, timelineConfigs, timelineData],
  );
  const events = useMemo(() => activeTimeline?.events ?? [], [activeTimeline]);
  const calendarDays = useMemo(() => getCalendarDays(events), [events]);
  const periodLabel = useMemo(() => formatPeriod(events), [events]);
  const eventMonthKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const event of events) {
      const cursor = getDateOnly(event.start);
      const end = getDateOnly(event.end);

      while (cursor <= end) {
        keys.add(`${cursor.getFullYear()}-${cursor.getMonth()}`);
        cursor.setMonth(cursor.getMonth() + 1, 1);
      }
    }

    return keys;
  }, [events]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeProgress, setTimeProgress] = useState(0);
  const [hoveredEventTitle, setHoveredEventTitle] = useState<string | null>(
    null,
  );
  const [tooltipData, setTooltipData] = useState<{
    event: Event;
    x: number;
    y: number;
    offset: number;
  } | null>(null);

  // Dev Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const [simRange, setSimRange] = useState({
    start: "2026-02-23T00:00",
    end: "2026-03-15T23:59",
  });
  const [simValue, setSimValue] = useState(0);

  useEffect(() => {
    const firstDay = calendarDays[0];
    const lastDay = calendarDays[calendarDays.length - 1];
    if (!firstDay || !lastDay) return;

    const toDateTimeLocal = (date: Date, time: string) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}T${time}`;
    };

    setSimRange({
      start: toDateTimeLocal(firstDay, "00:00"),
      end: toDateTimeLocal(lastDay, "23:59"),
    });
  }, [calendarDays]);

  useEffect(() => {
    if (containerRef.current) {
      const ease = getCmsGsapEasing();

      gsap.fromTo(
        containerRef.current.querySelectorAll(".calendar-day"),
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.03,
          ease,
        },
      );
    }
  }, []);

  useEffect(() => {
    if (isSimulating) return;

    const updateProgress = () => {
      const now = new Date();
      setCurrentDate(now);
    };

    updateProgress();
    const interval = setInterval(updateProgress, 60000);
    return () => clearInterval(interval);
  }, [isSimulating]);

  useEffect(() => {
    const startOfDay = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate(),
    );
    const secondsPassed = (currentDate.getTime() - startOfDay.getTime()) / 1000;
    const progress = Math.max(0, Math.min(100, (secondsPassed / 86400) * 100));
    setTimeProgress(progress);
  }, [currentDate]);

  // Handle Simulation Slider Change
  useEffect(() => {
    if (!isSimulating) return;

    const start = new Date(simRange.start).getTime();
    const end = new Date(simRange.end).getTime();
    const total = end - start;
    const targetTime = start + (total * simValue) / 10000;
    setCurrentDate(new Date(targetTime));
  }, [simValue, simRange, isSimulating]);

  const isToday = (date: Date) => {
    return date.toDateString() === currentDate.toDateString();
  };

  const getEventsForDay = (date: Date) => {
    return events.filter((event) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const start = new Date(event.start);
      start.setHours(0, 0, 0, 0);
      const end = new Date(event.end);
      end.setHours(0, 0, 0, 0);
      return d >= start && d <= end;
    });
  };

  if (!activeTimeline) {
    return (
      <div className="border border-white/8 bg-black/30 p-6 text-sm text-neutral-400">
        Timeline seleksi untuk Batch {activeBatch} tahun {activeYear} belum
        tersedia.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-white/5 pb-4">
        <p className="text-gold-500 text-xs font-semibold tracking-[0.3em] uppercase">
          Batch {activeBatch}
        </p>
        <p className="text-xs text-neutral-500">{periodLabel}</p>
      </div>

      {/* Desktop Calendar Grid */}
      <div className="hidden md:block">
        <div className="scrollbar-hide overflow-x-auto pb-4">
          <div className="min-w-150 lg:min-w-full">
            <div className="mb-4 grid grid-cols-7 gap-2 md:gap-4">
              {DAYS_OF_WEEK.map((day) => (
                <div
                  key={day}
                  className="text-center text-[10px] font-semibold tracking-widest text-neutral-500"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px border border-white/5 bg-white/5 shadow-2xl">
              {calendarDays.map((date, index) => {
                const dayEvents = getEventsForDay(date);
                const active = isToday(date);
                const hasContinuous = dayEvents.some(
                  (e) => e.start.getTime() !== e.end.getTime(),
                );
                const isCurrentMonth = eventMonthKeys.has(
                  `${date.getFullYear()}-${date.getMonth()}`,
                );

                return (
                  <div
                    key={index}
                    className={`calendar-day relative min-h-30 bg-[#0a0a0a] py-2 transition-colors hover:bg-white/2 md:py-3 ${
                      !isCurrentMonth ? "opacity-30" : ""
                    } ${active ? "z-20 shadow-[0_0_20px_rgba(212,166,77,0.05)]" : hasContinuous ? "z-30" : "z-10"}`}
                  >
                    {active && (
                      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                        <div
                          className="bg-gold-500/5 h-full transition-all duration-1000"
                          style={{ width: `${timeProgress}%` }}
                        />
                        <div
                          className="bg-gold-500/20 absolute top-0 bottom-0 w-px transition-all duration-1000"
                          style={{ left: `${timeProgress}%` }}
                        />
                      </div>
                    )}
                    <div className="mb-2 flex items-center justify-between px-2 md:px-3">
                      <div className="flex items-center gap-2">
                        {active && (
                          <span className="bg-gold-500 h-4 w-0.5 rounded-full" />
                        )}
                        <span
                          className={`font-serif text-sm transition-colors ${
                            active
                              ? "text-gold-500 font-bold"
                              : "text-neutral-500"
                          }`}
                        >
                          {date.getDate()}
                        </span>
                      </div>
                      {active && (
                        <span className="text-gold-500/80 text-[8px] font-bold tracking-widest uppercase">
                          Today
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {dayEvents.map((event, i) => {
                        const d = new Date(date);
                        d.setHours(0, 0, 0, 0);
                        const start = new Date(event.start);
                        start.setHours(0, 0, 0, 0);
                        const end = new Date(event.end);
                        end.setHours(0, 0, 0, 0);

                        const isStart = d.getTime() === start.getTime();
                        const isEnd = d.getTime() === end.getTime();
                        const isContinuous = start.getTime() !== end.getTime();

                        // For multi-day: show title only on start day or if it's Monday
                        const showTitle = isStart || date.getDay() === 1;
                        // Determine which badge to show
                        const showDeadline = isEnd && event.endTime;
                        const showInfo =
                          !isContinuous && !showDeadline && event.startTime;

                        const isHovered = event.title === hoveredEventTitle;

                        // Event is active if current time is within range OR it's the day the event starts
                        const isEventActive =
                          (currentDate >= event.start &&
                            currentDate <= event.end) ||
                          isToday(new Date(event.start));

                        return (
                          <div
                            key={i}
                            onMouseEnter={(e) => {
                              setHoveredEventTitle(event.title);
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              const containerRect =
                                containerRef.current?.getBoundingClientRect();
                              if (containerRect) {
                                const x =
                                  rect.left -
                                  containerRect.left +
                                  rect.width / 2;
                                const y = rect.top - containerRect.top;
                                const containerWidth = containerRect.width;
                                const tooltipWidth = 256; // w-64
                                const halfWidth = tooltipWidth / 2;

                                let offset = 0;
                                if (x - halfWidth < 16) {
                                  offset = 16 - (x - halfWidth);
                                } else if (
                                  x + halfWidth >
                                  containerWidth - 16
                                ) {
                                  offset =
                                    containerWidth - 16 - (x + halfWidth);
                                }

                                setTooltipData({
                                  event,
                                  x,
                                  y,
                                  offset,
                                });
                              }
                            }}
                            onMouseLeave={() => {
                              setHoveredEventTitle(null);
                              setTooltipData(null);
                            }}
                            className={`group relative flex h-10 flex-col justify-center overflow-hidden px-2 py-1 text-[10px] leading-tight opacity-100 transition-all md:h-12 md:text-xs ${
                              isEventActive
                                ? "text-gold-200 bg-[#1a150e]" // Active event background
                                : "bg-[#141414] text-neutral-300" // Inactive event background
                            } ${
                              !isContinuous
                                ? "mx-2 rounded-sm border md:mx-3"
                                : `${isStart ? "-mr-px ml-2 rounded-l-sm border-l md:ml-3" : ""} ${
                                    isEnd
                                      ? "mr-2 -ml-px rounded-r-sm border-r md:mr-3"
                                      : ""
                                  } ${!isStart && !isEnd ? "-mx-px" : ""} border-y`
                            } ${
                              isEventActive
                                ? isHovered
                                  ? "border-gold-500/60"
                                  : "border-gold-500/30"
                                : isHovered
                                  ? "border-white/30"
                                  : "border-white/10"
                            } ${isHovered ? "brightness-110" : ""}`}
                            style={{
                              zIndex: isHovered ? 50 : isContinuous ? 10 : 1,
                            }}
                          >
                            <div
                              className={`flex w-full gap-2 ${
                                isContinuous
                                  ? "items-start justify-between text-left"
                                  : "items-center justify-center text-center"
                              }`}
                            >
                              <div
                                className={`line-clamp-2 font-medium wrap-break-word whitespace-normal ${
                                  isContinuous ? "flex-1" : ""
                                }`}
                              >
                                {showTitle ? event.title : "\u00A0"}
                              </div>
                              {showDeadline && (
                                <div
                                  className={`flex shrink-0 items-center gap-1 rounded-[2px] px-1.5 py-0.5 pb-0.5 transition-all duration-300 ${
                                    isEventActive
                                      ? "bg-gold-500 shadow-[0_2px_10px_rgba(212,166,77,0.3)]"
                                      : "bg-white/5"
                                  }`}
                                >
                                  <span
                                    className={`shrink-0 text-[7px] leading-none font-black uppercase ${
                                      isEventActive
                                        ? "text-black/40"
                                        : "text-neutral-600"
                                    }`}
                                  >
                                    DL
                                  </span>
                                  <div
                                    className={`truncate text-[8px] leading-none font-bold ${
                                      isEventActive
                                        ? "text-black"
                                        : "text-neutral-400"
                                    }`}
                                  >
                                    {event.endTime}
                                  </div>
                                </div>
                              )}
                              {showInfo && (
                                <div
                                  className={`flex shrink-0 items-center gap-1 rounded-[2px] px-1.5 py-0.5 pb-0.5 transition-all duration-300 ${
                                    isEventActive
                                      ? "bg-white/90 shadow-[0_2px_10px_rgba(255,255,255,0.1)]"
                                      : "bg-white/5"
                                  }`}
                                >
                                  <IconInfo
                                    className={`h-2.5 w-2.5 shrink-0 ${
                                      isEventActive
                                        ? "text-black/40"
                                        : "text-neutral-600"
                                    }`}
                                  />
                                  <div
                                    className={`truncate text-[8px] leading-none font-bold ${
                                      isEventActive
                                        ? "text-black"
                                        : "text-neutral-400"
                                    }`}
                                  >
                                    {event.startTime}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div
                              className={`bg-gold-500/5 pointer-events-none absolute inset-0 opacity-0 transition-opacity ${isHovered ? "opacity-100" : "group-hover:opacity-100"}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-[10px] tracking-wide text-neutral-500 uppercase">
          <div className="flex items-center gap-2">
            <div className="border-gold-500/40 h-2 w-2 border bg-[#1a150e]" />
            <span>Tahap Aktif</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 border border-white/10 bg-[#141414]" />
            <span>Jadwal & Agenda</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-gold-500 h-3 w-0.5 rounded-full" />
            <span>Penanda Hari</span>
          </div>
        </div>
      </div>

      {/* Mobile Vertical Timeline */}
      <div className="block px-2 md:hidden">
        <div className="relative">
          <div className="relative flex flex-col">
            {events.map((event, index) => {
              const isContinuous =
                event.start.getTime() !== event.end.getTime();

              const startStr = event.start.toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
              });
              const endStr = event.end.toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
              });

              const isEventActive =
                (currentDate >= event.start && currentDate <= event.end) ||
                isToday(new Date(event.start));
              const isEventPast = currentDate > event.end;
              const hasReachedEvent = currentDate >= event.start;

              // Progress logic for segments
              const isFirst = index === 0;
              const isLast = index === events.length - 1;

              return (
                <div key={index} className="group flex items-stretch gap-6">
                  {/* Timeline Node Container with built-in track segments */}
                  <div className="relative flex w-3.75 shrink-0 flex-col items-center">
                    {/* Top Segment (connects to previous node) */}
                    <div
                      className={`z-0 -mb-2 w-0.5 flex-1 transition-colors duration-500 ${
                        isFirst
                          ? "bg-transparent"
                          : hasReachedEvent
                            ? "bg-gold-500"
                            : "bg-white/10"
                      }`}
                    />

                    {/* The Node itself */}
                    <div className="relative shrink-0 py-2">
                      <div
                        className={`relative z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[#0a0a0a] transition-all duration-500 ${
                          isEventActive
                            ? "bg-gold-500 shadow-[0_0_15px_rgba(212,166,77,0.4)]"
                            : hasReachedEvent
                              ? "bg-[#d4a64d]"
                              : "bg-neutral-800"
                        } ${isEventActive ? "scale-125" : ""}`}
                      />
                    </div>

                    {/* Bottom Segment (connects to next node) */}
                    <div
                      className={`z-0 -mt-2 w-0.5 flex-1 transition-colors duration-500 ${
                        isLast
                          ? "bg-transparent"
                          : isEventPast
                            ? "bg-gold-500"
                            : "bg-white/10"
                      }`}
                    />
                  </div>

                  {/* Card content */}
                  <div className="flex-1 py-4">
                    <div
                      className={`rounded-lg border p-4 transition-all duration-500 ${
                        isEventActive
                          ? "border-gold-500/40 bg-[#1a150e] shadow-[0_4px_20px_rgba(212,166,77,0.05)]"
                          : "border-white/5 bg-[#0f0f0f]"
                      }`}
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-3">
                        <div>
                          <h4
                            className={`font-serif text-base transition-colors ${
                              isEventActive
                                ? "text-gold-300"
                                : "text-neutral-300"
                            }`}
                          >
                            {event.title}
                          </h4>
                          <div className="text-[10px] font-medium tracking-wide text-neutral-500">
                            {isContinuous
                              ? `${startStr} – ${endStr}`
                              : startStr}
                          </div>
                        </div>

                        {event.endTime && (
                          <div
                            className={`flex shrink-0 items-center gap-1 rounded-[2px] px-1.5 py-0.5 transition-all duration-500 ${
                              isEventActive
                                ? "bg-gold-500 opacity-100 shadow-[0_2px_10px_rgba(212,166,77,0.2)]"
                                : "bg-white/5 opacity-50"
                            }`}
                          >
                            <span
                              className={`shrink-0 text-[7px] font-black uppercase ${
                                isEventActive
                                  ? "text-black/50"
                                  : "text-neutral-600"
                              }`}
                            >
                              DL
                            </span>
                            <div
                              className={`text-[8px] font-bold ${
                                isEventActive
                                  ? "text-black"
                                  : "text-neutral-400"
                              }`}
                            >
                              {event.endTime}
                            </div>
                          </div>
                        )}

                        {event.startTime && (
                          <div
                            className={`flex shrink-0 items-center gap-1 rounded-[2px] px-1.5 py-0.5 transition-all duration-500 ${
                              isEventActive
                                ? "bg-white/90 opacity-100 shadow-[0_2px_10px_rgba(255,255,255,0.1)]"
                                : "bg-white/5 opacity-50"
                            }`}
                          >
                            <IconInfo
                              className={`h-2.5 w-2.5 shrink-0 ${
                                isEventActive
                                  ? "text-black/40"
                                  : "text-neutral-600"
                              }`}
                            />
                            <div
                              className={`text-[8px] font-bold ${
                                isEventActive
                                  ? "text-black"
                                  : "text-neutral-400"
                              }`}
                            >
                              {event.startTime}
                            </div>
                          </div>
                        )}
                      </div>

                      <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 italic">
                        {event.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Tooltip */}
      <AnimatePresence>
        {tooltipData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="pointer-events-none absolute z-100 w-64 -translate-x-1/2 -translate-y-[calc(100%+12px)]"
            style={{
              left: tooltipData.x + tooltipData.offset,
              top: tooltipData.y,
            }}
          >
            <div className="border-gold-500/20 relative overflow-hidden rounded-lg border bg-black/95 p-4 shadow-2xl backdrop-blur-md">
              {/* Accent Line */}
              <div className="bg-gold-500 absolute top-0 left-0 h-1 w-full opacity-50" />

              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="text-gold-100 flex-1 font-serif text-sm leading-tight font-bold">
                  {tooltipData.event.title}
                </h3>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-neutral-400">
                  <IconCalendar className="h-3 w-3" />
                  <span className="text-[10px] font-medium tracking-wide">
                    {tooltipData.event.dateStr}
                    {tooltipData.event.startTime &&
                      ` • ${tooltipData.event.startTime}`}
                    {tooltipData.event.endTime &&
                      ` • Deadline: ${tooltipData.event.endTime}`}
                    {!tooltipData.event.startTime &&
                      !tooltipData.event.endTime &&
                      " • Waktu Menyusul"}
                  </span>
                </div>

                <div className="flex items-start gap-2 text-neutral-300">
                  <IconClock className="h-3 w-3 shrink-0 translate-y-0.5" />
                  <p className="text-[10px] leading-relaxed italic">
                    {tooltipData.event.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Tooltip Arrow */}
            <div
              className="border-gold-500/20 absolute -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b bg-black"
              style={{
                left: `calc(50% - ${tooltipData.offset}px)`,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Development Simulation Controls */}
      {process.env.NODE_ENV === "development" && (
        <div className="fixed right-6 bottom-6 z-50 flex w-80 flex-col gap-4 rounded-xl border border-white/10 bg-black/80 p-4 shadow-2xl backdrop-blur-xl transition-all hover:bg-black/90">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-gold-500 h-2 w-2 animate-pulse rounded-full" />
              <span className="text-[10px] font-bold tracking-widest text-white uppercase">
                Dev Simulator
              </span>
            </div>
            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`rounded px-2 py-0.5 text-[10px] font-bold transition-all ${
                isSimulating
                  ? "bg-gold-500 text-black shadow-[0_0_10px_rgba(212,166,77,0.4)]"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {isSimulating ? "ON" : "OFF"}
            </button>
          </div>

          {isSimulating && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <IconCalendar className="h-2.5 w-2.5 text-neutral-500" />
                    <label className="text-[8px] font-bold text-neutral-500 uppercase">
                      Start Range
                    </label>
                  </div>
                  <input
                    type="datetime-local"
                    value={simRange.start}
                    onChange={(e) =>
                      setSimRange({ ...simRange, start: e.target.value })
                    }
                    className="focus:border-gold-500/50 w-full rounded border border-white/10 bg-white/5 p-1 text-[10px] text-white transition-colors outline-none focus:bg-white/10"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <IconCalendar className="h-2.5 w-2.5 text-neutral-500" />
                    <label className="text-[8px] font-bold text-neutral-500 uppercase">
                      End Range
                    </label>
                  </div>
                  <input
                    type="datetime-local"
                    value={simRange.end}
                    onChange={(e) =>
                      setSimRange({ ...simRange, end: e.target.value })
                    }
                    className="focus:border-gold-500/50 w-full rounded border border-white/10 bg-white/5 p-1 text-[10px] text-white transition-colors outline-none focus:bg-white/10"
                  />
                </div>
              </div>

              <div className="space-y-2.5 rounded-lg bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-neutral-400">
                    <IconClock className="h-3 w-3" />
                    <span className="text-[10px] font-medium">Simulation</span>
                  </div>
                  <div className="bg-gold-500/10 rounded px-1.5 py-0.5">
                    <span className="text-gold-400 font-mono text-[10px] font-bold">
                      {currentDate.toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                      })}{" "}
                      {currentDate.toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10000"
                  value={simValue}
                  onChange={(e) => setSimValue(parseInt(e.target.value))}
                  className="accent-gold-500 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-neutral-700"
                />
              </div>

              <div className="flex items-center gap-2 border-t border-white/5 pt-2 text-[9px] text-neutral-500 italic">
                <IconInfo className="h-2.5 w-2.5 shrink-0" />
                <span>Simulated time overrides system for calendar logic.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SelectionTimelineCalendar;
