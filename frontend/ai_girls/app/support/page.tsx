"use client";

import { useEffect, useState } from "react";
import { toastError, toastSuccess } from "@/lib/toast";
import { createSupportTicket } from "@/lib/auth";

export default function SupportPage() {
  const [subject, setSubject] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const token = localStorage.getItem('jwt');
      if (token && !email) {
        // if authenticated, we could fetch profile email; keep simple for now
      }
    } catch {}
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    try {
      setLoading(true);
      await createSupportTicket(subject, message, email || undefined);
      setSubject(""); setEmail(""); setMessage("");
      toastSuccess('Сообщение отправлено', 'Мы свяжемся с вами по email.');
    } catch (e: any) {
      toastError('Не удалось отправить', e?.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="text-xl font-semibold">Поддержка</div>
      <div className="mt-1 text-sm text-muted-foreground">Опишите проблему или задайте вопрос — мы ответим по email.</div>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label className="text-sm">Тема</label>
          <input value={subject} onChange={(e)=>setSubject(e.target.value)} required className="mt-1 w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-sm">Email для связи (необязательно, если авторизованы)</label>
          <input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" placeholder="hello@example.com" className="mt-1 w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-sm">Сообщение</label>
          <textarea value={message} onChange={(e)=>setMessage(e.target.value)} required rows={6} className="mt-1 w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex justify-end">
          <button disabled={loading || !subject.trim() || !message.trim()} className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50">{loading ? 'Отправляем…' : 'Отправить'}</button>
        </div>
      </form>
    </div>
  );
}
