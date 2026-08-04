import OnboardingWizard from "./OnboardingWizard";

export default function OnboardingPage() {
    return (
        <main className="mx-auto max-w-2xl px-4 py-10">
            <h1 className="mb-6 text-center text-2xl font-semibold text-slate-900">
                Configurá tu cuenta
            </h1>
            <OnboardingWizard />
        </main>
    );
}
