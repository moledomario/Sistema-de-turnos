import AccesoClient from "./AccesoClient";

export default async function AccesoPage({ params }) {
    const { token } = await params;

    return (
        <main className="mx-auto max-w-md px-4 py-10">
            <AccesoClient token={token} />
        </main>
    );
}
