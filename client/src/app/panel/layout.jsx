import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app-sidebar";
import PanelGuard from "./PanelGuard";
import PanelHeaderTitle from "./PanelHeaderTitle";
import TrialBanner from "./TrialBanner";
import { PendingRequestsProvider } from "./PendingRequestsContext";

export default function PanelLayout({ children }) {
    return (
        <PendingRequestsProvider>
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-4">
                        <SidebarTrigger />
                        <Separator orientation="vertical" className="h-4" />
                        <PanelHeaderTitle />
                    </header>
                    <div className="flex-1 overflow-auto">
                        {/* Va afuera del guard a propósito: el guard no rinde
                            nada mientras carga o si falta el onboarding, y el
                            aviso de la prueba tiene que verse igual. */}
                        <TrialBanner />
                        <PanelGuard>{children}</PanelGuard>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </PendingRequestsProvider>
    );
}
