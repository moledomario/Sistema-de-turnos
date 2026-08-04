"use client";

import { useEffect, useState, useTransition } from "react";
import {
    getMyServices,
    createMyService,
    updateMyService,
    deleteMyService,
} from "../lib/api";
import ImageField from "../components/ImageField";

const emptyForm = {
    name: "",
    duration: "30",
    price: "",
    image: null,
    requires_deposit: false,
    deposit_amount: "",
    bank_details: "",
};

export default function ServicesManager({ token }) {
    const [myServices, setMyServices] = useState([]);
    const [error, setError] = useState(null);
    const [loading, startTransition] = useTransition();

    // `editing` es null cuando el formulario está cerrado, "new" cuando se está
    // creando y el id del servicio cuando se está editando uno.
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    const loadData = () => {
        startTransition(async () => {
            try {
                const servicesData = await getMyServices(token);
                setMyServices(servicesData.services ?? []);
                setError(null);
            } catch (err) {
                setError(err.message);
            }
        });
    };

    useEffect(loadData, [token]);

    const openNew = () => {
        setForm(emptyForm);
        setFormError(null);
        setEditing("new");
    };

    const openEdit = (offering) => {
        setForm({
            name: offering.service.name,
            duration: String(offering.duration),
            price: offering.price == null ? "" : String(offering.price),
            image: offering.image ?? null,
            requires_deposit: Boolean(offering.requires_deposit),
            deposit_amount: offering.deposit_amount == null ? "" : String(offering.deposit_amount),
            bank_details: offering.bank_details ?? "",
        });
        setFormError(null);
        setEditing(offering.id);
    };

    const closeForm = () => {
        setEditing(null);
        setFormError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setFormError(null);

        try {
            const price = form.price === "" ? null : Number(form.price);
            const bankDetails = form.requires_deposit ? form.bank_details.trim() : null;
            const depositAmount =
                form.requires_deposit && form.deposit_amount !== ""
                    ? Number(form.deposit_amount)
                    : null;

            if (editing === "new") {
                await createMyService(token, {
                    name: form.name,
                    duration: Number(form.duration),
                    ...(price == null ? {} : { price }),
                    ...(form.image ? { image: form.image } : {}),
                    requires_deposit: form.requires_deposit,
                    ...(depositAmount ? { deposit_amount: depositAmount } : {}),
                    ...(bankDetails ? { bank_details: bankDetails } : {}),
                });
            } else {
                await updateMyService(token, editing, {
                    duration: Number(form.duration),
                    price,
                    image: form.image,
                    requires_deposit: form.requires_deposit,
                    deposit_amount: depositAmount,
                    bank_details: bankDetails,
                });
            }

            closeForm();
            loadData();
        } catch (err) {
            setFormError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteMyService(token, id);
            setMyServices((prev) => prev.filter((s) => s.id !== id));
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <section>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Servicios que ofrecés</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Lo que ve el cliente cuando entra a tu link de reserva.
                    </p>
                </div>
                {!editing && (
                    <button
                        type="button"
                        onClick={openNew}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                    >
                        + Nuevo servicio
                    </button>
                )}
            </div>

            {editing && (
                <ServiceForm
                    form={form}
                    setForm={setForm}
                    isNew={editing === "new"}
                    submitting={submitting}
                    error={formError}
                    onSubmit={handleSubmit}
                    onCancel={closeForm}
                />
            )}

            {loading && <p className="text-sm text-slate-400">Cargando servicios...</p>}
            {!loading && error && <p className="text-sm text-rose-600">{error}</p>}
            {!loading && !error && myServices.length === 0 && !editing && (
                <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                    Todavía no ofrecés ningún servicio.
                </p>
            )}

            {!loading && !error && myServices.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {myServices.map((offering) => (
                        <ServiceCard
                            key={offering.id}
                            offering={offering}
                            onEdit={() => openEdit(offering)}
                            onDelete={() => handleDelete(offering.id)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function ServiceCard({ offering, onEdit, onDelete }) {
    return (
        <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
            <div className="relative aspect-video bg-slate-100">
                {offering.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={offering.image}
                        alt={offering.service.name}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 text-3xl font-semibold text-indigo-300">
                        {offering.service.name.charAt(0).toUpperCase()}
                    </div>
                )}
                {offering.requires_deposit && (
                    <span className="absolute right-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 shadow-sm">
                        {offering.deposit_amount == null
                            ? "Con seña"
                            : `Seña $${offering.deposit_amount}`}
                    </span>
                )}
            </div>

            <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="font-medium text-slate-900">{offering.service.name}</h3>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {offering.duration} min
                    </span>
                    {offering.price == null ? (
                        <span className="text-xs text-slate-400">Sin precio</span>
                    ) : (
                        <span className="text-sm font-semibold text-indigo-600">
                            ${offering.price}
                        </span>
                    )}
                </div>

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

function ServiceForm({ form, setForm, isNew, submitting, error, onSubmit, onCancel }) {
    const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

    return (
        <form
            onSubmit={onSubmit}
            className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
            <h3 className="mb-4 font-semibold text-slate-900">
                {isNew ? "Nuevo servicio" : `Editar ${form.name}`}
            </h3>

            <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
                <ImageField
                    label="Imagen (opcional)"
                    value={form.image}
                    onChange={(image) => setField("image", image)}
                />

                <div className="space-y-4">
                    {isNew && (
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700">
                                Nombre del servicio
                            </label>
                            <input
                                type="text"
                                required
                                autoFocus
                                value={form.name}
                                onChange={(e) => setField("name", e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700">
                                Duración (min)
                            </label>
                            <input
                                type="number"
                                min="5"
                                required
                                value={form.duration}
                                onChange={(e) => setField("duration", e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700">
                                Valor (opcional)
                            </label>
                            <input
                                type="number"
                                min="0"
                                value={form.price}
                                onChange={(e) => setField("price", e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                                type="checkbox"
                                checked={form.requires_deposit}
                                onChange={(e) => setField("requires_deposit", e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            ¿Necesita seña?
                        </label>

                        {form.requires_deposit && (
                            <div className="mt-3">
                                <label className="mb-1 block text-xs font-medium text-slate-700">
                                    Monto de la seña
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    value={form.deposit_amount}
                                    onChange={(e) => setField("deposit_amount", e.target.value)}
                                    className="mb-3 w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />

                                <label className="mb-1 block text-xs font-medium text-slate-700">
                                    Datos de la cuenta para transferir
                                </label>
                                <textarea
                                    required
                                    rows={3}
                                    value={form.bank_details}
                                    onChange={(e) => setField("bank_details", e.target.value)}
                                    placeholder={"Alias: mi.alias.mp\nCBU: 0000003100010000000001\nTitular: Nombre Apellido"}
                                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                    El cliente los ve al reservar y puede subir el comprobante de la
                                    transferencia.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

            <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {submitting ? "Guardando..." : isNew ? "Agregar servicio" : "Guardar cambios"}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-sm text-slate-500 transition hover:text-slate-700"
                >
                    Cancelar
                </button>
            </div>
        </form>
    );
}
