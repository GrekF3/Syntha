"use client";

import ChatList from "./_components/ChatList";

export default function ChatsPage() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-4 sm:-m-6">
      <div className="w-full md:w-auto">
        <ChatList />
      </div>
      <main className="hidden md:flex flex-1 min-w-0 bg-transparent p-4 sm:p-6">
        <div className="h-full w-full grid place-items-center">
          <div className="text-center max-w-md">
            <div className="text-xl font-semibold">Выберите чат</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Начните разговор с моделью или продолжите существующий.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

