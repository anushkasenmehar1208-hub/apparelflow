export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-16 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <section className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-12">
        <p className="text-sm font-medium uppercase tracking-widest text-teal-700 dark:text-teal-400">Garment production ERP</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">ApparelFlow</h1>
        <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
          A foundation for managing garment recipes and production workflows.
        </p>
        <p className="mt-6 border-t border-zinc-200 pt-6 text-sm leading-6 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Day 1 project skeleton. Production workflows will be introduced in later phases.
        </p>
      </section>
    </main>
  );
}
