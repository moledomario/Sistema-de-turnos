"use client";

import { useEffect, useState, useTransition } from "react";
import { getMyTeam, createTeamMember, updateTeamMember, deleteTeamMember } from "../lib/api";
import ImageField from "../components/ImageField";

const emptyForm = { name: "", description: "", image: null };

export default function TeamManager({ token }) {
    const [team, setTeam] = useState([]);
    const [error, setError] = useState(null);
    const [loading, startTransition] = useTransition();

    // null con el formulario cerrado, "new" al agregar, el id al editar.
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    const loadTeam = () => {
        startTransition(async () => {
            try {
                const data = await getMyTeam(token);
                setTeam(data.team ?? []);
                setError(null);
            } catch (err) {
                setError(err.message);
            }
        });
    };

    useEffect(loadTeam, [token]);

    const openNew = () => {
        setForm(emptyForm);
        setFormError(null);
        setEditing("new");
    };

    const openEdit = (member) => {
        setForm({
            name: member.name,
            description: member.description ?? "",
            image: member.image ?? null,
        });
        setFormError(null);
        setEditing(member.id);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setFormError(null);

        try {
            const payload = {
                name: form.name,
                description: form.description.trim() || null,
                image: form.image,
            };

            if (editing === "new") {
                await createTeamMember(token, {
                    name: payload.name,
                    ...(payload.description ? { description: payload.description } : {}),
                    ...(payload.image ? { image: payload.image } : {}),
                });
            } else {
                await updateTeamMember(token, editing, payload);
            }

            setEditing(null);
            loadTeam();
        } catch (err) {
            setFormError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteTeamMember(token, id);
            setTeam((prev) => prev.filter((member) => member.id !== id));
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <section>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Tus profesionales</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        El equipo que trabaja con vos: una foto, el nombre y qué hace cada uno.
                    </p>
                </div>
                {!editing && (
                    <button
                        type="button"
                        onClick={openNew}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                    >
                        + Agregar profesional
                    </button>
                )}
            </div>

            {editing && (
                <form
                    onSubmit={handleSubmit}
                    className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                    <h3 className="mb-4 font-semibold text-slate-900">
                        {editing === "new" ? "Nuevo profesional" : `Editar ${form.name}`}
                    </h3>

                    <div className="grid gap-5 sm:grid-cols-[9rem_1fr]">
                        <ImageField
                            label="Foto (opcional)"
                            value={form.image}
                            onChange={(image) => setForm((prev) => ({ ...prev, image }))}
                            aspect="aspect-square"
                        />

                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">
                                    Nombre
                                </label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm((prev) => ({ ...prev, name: e.target.value }))
                                    }
                                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">
                                    ¿Qué hace? (opcional)
                                </label>
                                <textarea
                                    rows={3}
                                    maxLength={300}
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm((prev) => ({ ...prev, description: e.target.value }))
                                    }
                                    placeholder="Ej: Colorista, atiende martes y jueves."
                                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    {formError && <p className="mt-3 text-sm text-rose-600">{formError}</p>}

                    <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting
                                ? "Guardando..."
                                : editing === "new"
                                ? "Agregar profesional"
                                : "Guardar cambios"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="text-sm text-slate-500 transition hover:text-slate-700"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            {loading && <p className="text-sm text-slate-400">Cargando profesionales...</p>}
            {!loading && error && <p className="text-sm text-rose-600">{error}</p>}
            {!loading && !error && team.length === 0 && !editing && (
                <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                    Todavía no agregaste profesionales.
                </p>
            )}

            {!loading && !error && team.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {team.map((member) => (
                        <TeamMemberCard
                            key={member.id}
                            member={member}
                            onEdit={() => openEdit(member)}
                            onDelete={() => handleDelete(member.id)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function TeamMemberCard({ member, onEdit, onDelete }) {
    return (
        <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
            <div className="aspect-square bg-slate-100">
                {member.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={member.image}
                        alt={member.name}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 text-4xl font-semibold text-indigo-300">
                        {member.name.charAt(0).toUpperCase()}
                    </div>
                )}
            </div>

            <div className="flex flex-1 flex-col gap-1 p-4">
                <h3 className="font-medium text-slate-900">{member.name}</h3>
                {member.description && (
                    <p className="text-sm text-slate-500">{member.description}</p>
                )}

                <div className="mt-auto flex items-center gap-3 border-t border-slate-100 pt-3 text-sm">
                    <button
                        type="button"
                        onClick={onEdit}
                        className="font-medium text-indigo-600 transition hover:text-indigo-700"
                    >
                        Editar
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        className="ml-auto text-slate-400 transition hover:text-rose-600"
                    >
                        Borrar
                    </button>
                </div>
            </div>
        </article>
    );
}
