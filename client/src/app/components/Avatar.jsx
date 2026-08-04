const PALETTE = [
    "bg-indigo-100 text-indigo-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-sky-100 text-sky-700",
];

function colorFor(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) % PALETTE.length;
    }
    return PALETTE[Math.abs(hash)];
}

// Con foto la muestra recortada en círculo; sin foto, las iniciales sobre un
// color derivado del nombre.
export default function Avatar({ firstName = "", lastName = "", size = 56, image = null }) {
    const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "?";
    const colorClass = colorFor(`${firstName}${lastName}`);

    if (image) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={image}
                alt={`${firstName} ${lastName}`.trim()}
                className="rounded-full object-cover"
                style={{ width: size, height: size }}
            />
        );
    }

    return (
        <div
            className={`flex items-center justify-center rounded-full font-semibold ${colorClass}`}
            style={{ width: size, height: size, fontSize: size * 0.38 }}
        >
            {initials}
        </div>
    );
}
