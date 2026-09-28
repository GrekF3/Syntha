export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Добро пожаловать 👋</h1>
        <p className="text-muted-foreground mt-1">
          Выберите раздел в боковом меню или начните новый диалог.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card text-card-foreground p-4">
          <div className="font-medium">Быстрый старт</div>
          <p className="text-sm text-muted-foreground mt-1">
            Создайте персонажа или откройте «Мои чаты».
          </p>
        </div>
        <div className="rounded-lg border bg-card text-card-foreground p-4">
          <div className="font-medium">Галерея</div>
          <p className="text-sm text-muted-foreground mt-1">
            Просматривайте и делитесь изображениями сообщества.
          </p>
        </div>
        <div className="rounded-lg border bg-card text-card-foreground p-4">
          <div className="font-medium">Подписка</div>
          <p className="text-sm text-muted-foreground mt-1">
            Подписка расширяет лимиты и открывает NSFW в будущем.
          </p>
        </div>
      </div>
    </div>
  );
}
