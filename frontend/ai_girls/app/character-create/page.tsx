"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Sparkles, RefreshCw, Download, AlertTriangle, ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// shadcn/ui
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

import { createModel, createImageJob, getImageJob, createChat } from "@/lib/chats";
import { useRouter } from "next/navigation";

// -------------------- Types --------------------

type Gender = "female" | "male";
type Style = "real" | "anime";
type Body = "skinny" | "slim" | "chubby" | "fat";
type Eye = "blue" | "green" | "brown" | "gray" | "amber";
type Hair = "blonde" | "brunette" | "brown" | "red" | "pastel";
type HairLen = "short" | "medium" | "long";

// -------------------- Assets (gender + style specific) --------------------
// Asset paths aligned with existing repo files
const ASSET = {
  coverGender: (g: Gender) => (g === "female" ? "/create-model/wooman.jpg" : "/create-model/man.jpg"),
  coverStyle: (g: Gender, s: Style) => (s === "anime"
    ? (g === "female" ? "/create-model/wooman-anime.jpg" : "/create-model/man-anime.jpg")
    : (g === "female" ? "/create-model/wooman-realistic.jpg" : "/create-model/man-realistic.jpg")),
  body: (_g: Gender, _s: Style, b: Body) => {
    const map: Record<Body, string> = {
      skinny: "/create-model/step-2/skiny.webp",
      slim: "/create-model/step-2/normal.webp",
      chubby: "/create-model/step-2/fat.webp",
      fat: "/create-model/step-2/fattest.webp",
    };
    return map[b];
  },
};

const BODY_TYPES: { key: Body; label: string }[] = [
  { key: "skinny", label: "Худая" },
  { key: "slim", label: "Стройная" },
  { key: "chubby", label: "Полненькая" },
  { key: "fat", label: "Пышная" },
];

const EYE_LABELS: Record<Eye, string> = { blue: "Голубые", green: "Зелёные", brown: "Карие", gray: "Серые", amber: "Янтарные" };
const HAIR_LABELS: Record<Hair, string> = { blonde: "Блондин(ка)", brunette: "Брюнет(ка)", brown: "Шатен(ка)", red: "Рыжий(ая)", pastel: "Пастельный" };
// English descriptors for prompting
const EYE_EN: Record<Eye, string> = { blue: "blue", green: "green", brown: "brown", gray: "gray", amber: "amber" };
const HAIR_EN: Record<Hair, string> = { blonde: "blonde", brunette: "brunette", brown: "brown", red: "red", pastel: "pastel colored" };
const HAIRLEN_EN: Record<HairLen, string> = { short: "short", medium: "medium-length", long: "long" };
const BODY_EN: Record<Body, string> = { skinny: "slender", slim: "slim", chubby: "curvy", fat: "plus-size" };
const EYES: Eye[] = ["blue", "green", "brown", "gray", "amber"];
const HAIR: Hair[] = ["blonde", "brunette", "brown", "red", "pastel"];
const EYE_COLORS: Record<Eye, string> = {
  blue: "#6fb7ff",
  green: "#7bcc6b",
  brown: "#8b5a2b",
  gray: "#9aa0a6",
  amber: "#c98c3a",
};
const HAIR_COLORS: Record<Hair, string> = {
  blonde: "#e3c285",
  brunette: "#3b2f2f",
  brown: "#6b4f3a",
  red: "#b04a3a",
  pastel: "linear-gradient(135deg,#ffd1dc,#c9f2ff)",
};
const HAIR_LEN: HairLen[] = ["short", "medium", "long"];
const HAIR_LEN_LABELS: Record<HairLen, string> = { short: "Короткие", medium: "Средние", long: "Длинные" };

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function defaultName(g: Gender | "anime") {
  const f = ["Luna", "Mia", "Sofia", "Iris"];
  const m = ["Alex", "Leo", "Max", "Noah"];
  const a = ["Akira", "Aoi", "Hana", "Yuki"];
  const src = g === "female" ? f : g === "male" ? m : a;
  return src[0]; // детерминированно, без случайностей
}

// -------------------- Main --------------------

export default function ModelEditorSqueezeWizard() {
  const router = useRouter();
  // Steps: 0 Пол → 1 Стиль → 2 Телосложение → 3 Внешность → 4 Профиль+Превью
  const totalSteps = 5;
  const [step, setStep] = useState(0);

  const [gender, setGender] = useState<Gender | null>(null);
  const [style, setStyle] = useState<Style | null>(null);
  const [body, setBody] = useState<Body | null>(null);
  const [eyes, setEyes] = useState<Eye | null>(null);
  const [hair, setHair] = useState<Hair | null>(null);
  const [hairLen, setHairLen] = useState<HairLen | null>(null);

  const [name, setName] = useState("");
  const [age, setAge] = useState<number>(21);
  const [interests, setInterests] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const [running, setRunning] = useState(false);
  const [genProgress, setGenProgress] = useState(0); // smoothed visual progress
  const [targetProgress, setTargetProgress] = useState(0); // server progress
  const [image, setImage] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // auto-fill deterministic name on profile step if empty
  useEffect(() => {
    if (step === 4 && !name && gender && style) setName(defaultName(style === "anime" ? "anime" : gender));
  }, [step, gender, style, name]);

  // Wizard progress: fraction of completed groups (no premature 100%)
  const groupsComplete = useMemo(() => [Boolean(gender), Boolean(style), Boolean(body), Boolean(eyes && hair && hairLen), Boolean(name && age >= 18)].filter(Boolean).length, [gender, style, body, eyes, hair, hairLen, name, age]);
  const wizardProgress = Math.round((groupsComplete / totalSteps) * 100);

  const canNext = useMemo(() => {
    if (step === 0) return Boolean(gender);
    if (step === 1) return Boolean(style);
    if (step === 2) return Boolean(body);
    if (step === 3) return Boolean(eyes && hair && hairLen);
    if (step === 4) return Boolean(name && age >= 18); // not used for Next on last step
    return false;
  }, [step, gender, style, body, eyes, hair, name, age]);

  function next() {
    if (!canNext) return;
    setStep((s) => Math.min(totalSteps - 1, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }
  function resetAll() {
    setStep(0);
    setGender(null);
    setStyle(null);
    setBody(null);
    setEyes(null);
    setHair(null);
    setName("");
    setAge(21);
    setInterests("");
    setBio("");
    setIsPublic(false);
    setImage(null);
    setGenProgress(0);
    setSaving(false);
    setCreatedId(null);
  }

  function makePrompt() {
    if (!gender || !style) return "portrait avatar";
    const ageDesc = age && age >= 18 ? `${age}-year-old adult` : 'adult';
    const subj = `${style === "anime" ? "anime" : "realistic"} ${ageDesc} ${gender === "female" ? "woman" : "man"}`;
    const eye = eyes ? `${EYE_EN[eyes]} eyes` : "";
    const hairClr = hair ? `${HAIR_EN[hair]} hair` : "";
    const hairLn = hairLen ? `${HAIRLEN_EN[hairLen]} hair` : "";
    const build = body ? `${BODY_EN[body]} build` : "slim build";
    const portrait = style === "anime"
      ? "anime illustration, clean lineart, cel shading"
      : "portrait photo, head and shoulders, 85mm lens, soft studio lighting";
    // Friendly, attractive vibe (tasteful, non-explicit)
    const persona = gender === 'female'
      ? 'attractive, feminine, friendly expression, soft warm smile, subtle makeup, elegant, slightly alluring, classy'
      : 'attractive, masculine, friendly expression, soft smile, well-groomed, confident, classy';
    // Always use a pleasant scenic background (not flat/clean)
    const bg = style === 'anime'
      ? 'scenic outdoor background, cherry blossoms or city park, soft ambient light, depth of field, anime background painting'
      : 'beautiful natural outdoor background, golden hour light, shallow depth of field, soft bokeh';
    // Strengthen key traits early in the prompt order
    const traits = [eye, hairLn, hairClr, build].filter(Boolean).join(", ");
    // Light negative guidance to avoid wrong hair colors
    const negatives = hair === 'blonde' ? ", not brunette, not red hair"
      : hair === 'brunette' ? ", not blonde, not red hair"
      : hair === 'red' ? ", not blonde, not brunette"
      : "";
    return `high quality, ${subj}, ${traits}${negatives}, ${persona}, ${bg}, centered composition, ${portrait}`;
  }

  function makeNegativePrompt() {
    const base = [
      'low quality', 'worst quality', 'blurry', 'watermark', 'text', 'signature',
      'extra fingers', 'extra limbs', 'deformed hands', 'bad anatomy', 'bad proportions',
      'glitch', 'jpeg artifacts'
    ];
    // Hair color consistency negatives
    if (hair === 'blonde') base.push('brunette hair', 'red hair');
    if (hair === 'brunette') base.push('blonde hair', 'red hair');
    if (hair === 'red') base.push('blonde hair', 'brunette hair');
    // Style-specific negatives
    if (style === 'anime') base.push('photorealistic skin texture');
    if (style === 'real') base.push('cartoon', 'cell shading');
    return base.join(', ');
  }

  // Smooth progress towards targetProgress
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setGenProgress((p) => {
        const target = Math.max(p, targetProgress);
        if (p >= target) return p;
        const delta = target - p;
        const step = Math.max(1, Math.ceil(delta / 3));
        return Math.min(target, p + step);
      });
    }, 160);
    return () => clearInterval(t);
  }, [running, targetProgress]);

  async function handleGenerate() {
    try {
      setRunning(true);
      setGenError(null);
      setImage(null);
      setGenProgress(0);
      setTargetProgress(0);
      const job = await createImageJob(makePrompt(), null, { negative_prompt: makeNegativePrompt(), style: style || 'real' });
      let current = job;
      setTargetProgress(current.progress ?? 0);
      // Poll until done/failed
      const started = Date.now();
      while (current.status !== 'done' && current.status !== 'failed') {
        await new Promise((r) => setTimeout(r, 700));
        current = await getImageJob(job.id);
        setTargetProgress(current.progress ?? 0);
        // Simple timeout safety (e.g., 60s)
        if (Date.now() - started > 60000 && current.progress < 100) break;
      }
      if (current.status === 'done' && current.result_url) {
        setImage(current.result_url);
      } else {
        setGenError(current?.error || 'Не удалось сгенерировать изображение');
        setImage("/window.svg");
      }
      setTargetProgress(100);
      setHasGenerated(true);
    } catch (e) {
      setImage("/window.svg");
      setGenError((e as any)?.message || 'Ошибка генерации');
      setTargetProgress(100);
    } finally {
      setRunning(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      const payload: any = {
        name,
        gender,
        age,
        bio,
        is_public: isPublic,
        avatar: image ?? "/window.svg",
      };
      const m = await createModel(payload);
      setCreatedId(m.id);
    } catch (e) {
      alert("Не удалось создать персонажа");
    } finally {
      setSaving(false);
    }
  }

  async function handleStartChat() {
    if (!createdId) return;
    try {
      const chat = await createChat(createdId);
      if (chat?.uuid) router.push(`/c/${chat.uuid}`);
    } catch (e) {
      alert('Не удалось создать чат');
    }
  }

  // -------------------- UI --------------------

  return (
    <div className="mx-auto w-full max-w-3xl px-3 sm:px-6 py-6">
      <div className="text-xl sm:text-2xl font-semibold text-center mb-3">Создать моего персонажа</div>
      <Card className="overflow-hidden">

        <CardContent className="p-0">
          {/* Step progress */}
          <nav aria-label="Progress" className="flex justify-center w-full items-center mt-2 mb-3 lg:mt-3 lg:mb-4 px-4">
            <div className="relative w-full lg:w-[760px] min-w-[328px]">
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-[#6A6A6A]" />
              <motion.div
                className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-primary"
                initial={false}
                animate={{ width: `${(step / (totalSteps - 1)) * 100}%` }}
                transition={{ duration: 0.45, ease: 'easeInOut' }}
                style={{ width: 0 }}
              />
              <ul role="list" className="relative flex justify-between items-center w-full">
                {Array.from({ length: totalSteps }).map((_, i) => {
                  const done = i < step;
                  const current = i === step;
                  return (
                    <li key={i} className="relative">
                      <span
                        className={cx(
                          "relative flex h-4 w-4 items-center justify-center rounded-full",
                          done && "bg-white",
                          !done && !current && "bg-[#3F3F3F] border-2 border-[#6A6A6A]",
                          current && "bg-[#3F3F3F] border-2 border-primary"
                        )}
                      >
                        {done && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>

          <div className="p-4">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div key="step-0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-4">
                  <Label className="block text-sm sm:text-base">Выбери пол персонажа</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["female", "male"] as Gender[]).map((g) => (
                      <button key={g} onClick={() => setGender(g)} className={cx("rounded-lg border hover:shadow-sm transition text-left", gender === g && "ring-2 ring-primary/40")}> 
                        <div className="relative aspect-[320/443] overflow-hidden rounded-t-lg">
                          <Image src={ASSET.coverGender(g)} alt={g === "female" ? "Женщина" : "Мужчина"} fill className="object-cover" />
                        </div>
                        <div className="p-2 text-sm font-medium">{g === "female" ? "Женщина" : "Мужчина"}</div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div key="step-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-4">
                  <Label className="block text-sm sm:text-base">Выбери стиль персонажа</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["real", "anime"] as Style[]).map((s) => (
                      <button key={s} onClick={() => setStyle(s)} className={cx("rounded-lg border hover:shadow-sm transition text-left", style === s && "ring-2 ring-primary/40")}> 
                        <div className="relative aspect-[320/443] overflow-hidden rounded-t-lg">
                          <Image src={ASSET.coverStyle(gender ?? "female", s)} alt={s === "real" ? "Реализм" : "Аниме"} fill className="object-cover" />
                        </div>
                        <div className="p-2 text-sm font-medium">{s === "real" ? "Реализм" : "Аниме"}</div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-3">
                  <Label className="block text-sm sm:text-base">Выбери телосложение</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {BODY_TYPES.map((b) => (
                      <button key={b.key} onClick={() => setBody(b.key)} className={cx("rounded-lg border hover:shadow-sm transition text-left", body === b.key && "ring-2 ring-primary/40")}>
                <div className="relative aspect-[320/443] overflow-hidden rounded-t-lg">
                  <Image src={ASSET.body(gender ?? "female", style ?? "real", b.key)} alt={b.label} fill className="object-cover" />
                </div>
                        <div className="p-2 text-sm font-medium">{b.label}</div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-6">
                  <Label className="block text-sm sm:text-base">Выбери внешность</Label>
                  <div>
                    <Label className="mb-2 block">Цвет глаз</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {EYES.map((e) => (
                        <button key={e} onClick={() => setEyes(e)} className={cx("rounded-lg border hover:shadow-sm transition", eyes === e && "ring-2 ring-primary/40")}>
                          <div className="relative aspect-square overflow-hidden rounded-t-lg">
                            <div className="absolute inset-0" style={{ background: EYE_COLORS[e] }} />
                          </div>
                          <div className="p-2 text-xs text-center">{EYE_LABELS[e]}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block">Цвет волос</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {HAIR.map((h) => (
                        <button key={h} onClick={() => setHair(h)} className={cx("rounded-lg border hover:shadow-sm transition", hair === h && "ring-2 ring-primary/40")}>
                          <div className="relative aspect-square overflow-hidden rounded-t-lg">
                            {HAIR_COLORS[h].startsWith("linear-gradient") ? (
                              <div className="absolute inset-0" style={{ backgroundImage: HAIR_COLORS[h] as any }} />
                            ) : (
                              <div className="absolute inset-0" style={{ background: HAIR_COLORS[h] }} />
                            )}
                          </div>
                          <div className="p-2 text-xs text-center">{HAIR_LABELS[h]}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block">Длина волос</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["short","medium","long"] as HairLen[]).map((l) => (
                        <button key={l} onClick={() => setHairLen(l)} className={cx("rounded-md border px-2 py-2 text-xs sm:text-sm hover:shadow-sm transition", hairLen === l && "ring-2 ring-primary/40")}>{HAIR_LEN_LABELS[l]}</button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="step-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-6">
                  <Label className="block text-sm sm:text-base">Заполни профиль и превью</Label>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Имя</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Luna" />
                      </div>
                      <div className="space-y-2">
                        <Label>Возраст</Label>
                        <Input type="number" min={18} value={age} onChange={(e) => setAge(parseInt(e.target.value || "0", 10))} />
                        {age < 18 && (
                          <div className="text-[11px] text-destructive flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5"/> Возраст должен быть 18+</div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Интересы (через запятую)</Label>
                        <Input value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="fashion, music" />
                      </div>
                      <div className="space-y-2">
                        <Label>Описание</Label>
                        <Textarea rows={5} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Кратко о характере и стиле общения" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Превью</Label>
                      <div className="relative w-full max-w-[480px] aspect-[4/5] mx-auto flex items-center justify-center p-2">
                        {!image ? (
                          <div className="grid place-items-center w-full h-full p-4 text-center">
                            {running ? (
                              <div className="w-80 max-w-[80%] flex flex-col items-center gap-2 text-center">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <div className="text-sm text-muted-foreground">Генерация…</div>
                              </div>
                            ) : genError ? (
                              <div className="space-y-2">
                                <div className="text-sm text-destructive">Ошибка: {genError}</div>
                                <div className="flex items-center justify-center gap-2">
                                  <Button size="sm" onClick={handleGenerate} className="gap-2"><RefreshCw className="h-4 w-4"/> Повторить</Button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground text-center">Нажмите «Сгенерировать аватар», чтобы получить изображение</div>
                            )}
                          </div>
                        ) : (
                          <Image src={image} alt="avatar" fill className="object-contain" />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 justify-end">
                        {!hasGenerated && (
                          <Button onClick={handleGenerate} disabled={running} className="gap-2">
                            <Sparkles className="h-4 w-4" /> Сгенерировать аватар
                          </Button>
                        )}
                        {hasGenerated && (
                          <>
                            <Button variant="ghost" onClick={handleGenerate} className="gap-2">
                              <RefreshCw className="h-4 w-4" /> Перегенерировать
                            </Button>
                            <Button variant="ghost" className="gap-2" onClick={() => {
                              if (!image) return;
                              const a = document.createElement('a');
                              a.href = image;
                              a.download = 'avatar.png';
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                            }}>
                              <Download className="h-4 w-4" /> Скачать
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Пол / Стиль</div>
                      <div>{gender === "female" ? "Женщина" : "Мужчина"} / {style === "real" ? "Реализм" : "Аниме"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Телосложение</div>
                      <div>{body ? BODY_TYPES.find((b) => b.key === body)?.label : "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Внешность</div>
                      <div>
                        {eyes ? EYE_LABELS[eyes] : "—"} / {hair ? HAIR_LABELS[hair] : "—"}
                        {hairLen ? ` / ${HAIR_LEN_LABELS[hairLen]}` : ""}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Имя</div>
                      <div>{name || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Возраст</div>
                      <div>{age}</div>
                    </div>
                    <div className="sm:col-span-3">
                      <div className="text-xs text-muted-foreground">Интересы</div>
                      <div className="line-clamp-1" title={interests}>{interests || "—"}</div>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Персонаж должен быть старше 18 лет.
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="secondary" onClick={resetAll} className="gap-2">
                      Начать заново
                    </Button>
                    <Button onClick={handleSave} disabled={saving || !name || age < 18} className="gap-2">
                      {saving ? "Сохраняем…" : createdId ? "Сохранено" : "Сохранить модель"}
                    </Button>
                    {createdId && (
                      <Button variant="outline" onClick={handleStartChat} className="gap-2">Начать чат</Button>
                    )}
                  </div>
                  {createdId && (
                    <div className="text-xs text-muted-foreground">Модель создана. Найдите её в «Мои модели» и начните чат.</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer nav (only for steps 0..3) */}
          {step < totalSteps - 1 && (
            <div className="px-4 py-3 border-t flex items-center justify-between">
              <Button variant="ghost" onClick={back} disabled={step === 0} className="gap-2">
                <ChevronLeft className="h-4 w-4" /> Назад
              </Button>
              <Button onClick={next} disabled={!canNext} className="gap-2">
                Далее <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
