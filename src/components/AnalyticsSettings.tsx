export function AnalyticsSettings() {
  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
      <h3 className="font-bold text-sm text-slate-900 dark:text-white">Usage analytics</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        Microsoft Clarity session recording and usage analytics are disabled across the app.
        A previously saved analytics choice does not enable recording.
      </p>
    </div>
  );
}
