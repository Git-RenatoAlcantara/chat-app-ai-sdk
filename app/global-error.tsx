'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full space-y-4 text-center">
            <h1 className="text-2xl font-semibold">Algo deu errado</h1>
            <p className="text-muted-foreground text-sm">
              Ocorreu um erro inesperado. Tente novamente.
            </p>
            <button
              onClick={() => reset()}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:opacity-90"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
