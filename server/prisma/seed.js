import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { trialEndsAt } from '../src/lib/access.js';

async function main() {
    // Limpieza: el seed anterior no era idempotente (create sin upsert),
    // así que cada corrida dejaba profesionales y servicios duplicados.
    // Se borra todo lo sembrado antes de recrearlo para que esto sea repetible.
    // El orden lo manda la cadena de FKs RESTRICT: los turnos cuelgan de
    // ProfessionalService y de TeamMember, y TeamMember de la cuenta, así que
    // el usuario es lo último que se puede borrar.
    await prisma.appointment.deleteMany({});
    await prisma.availability.deleteMany({});
    await prisma.professionalService.deleteMany({});
    await prisma.teamMember.deleteMany({ where: { account: { role: 'PROFESSIONAL' } } });
    await prisma.user.deleteMany({ where: { role: 'PROFESSIONAL' } });
    await prisma.service.deleteMany({});

    const corteCabello = await prisma.service.create({
        data: {
            name: 'Corte de cabello',
            description: 'Corte de cabello clásico',
        },
    });

    const corteBarba = await prisma.service.create({
        data: {
            name: 'Corte de barba',
            description: 'Perfilado y arreglo de barba',
        },
    });

    const professional = await prisma.user.create({
        data: {
            email: 'profesional@test.com',
            password: await bcrypt.hash('123456', 10),
            firts_name: 'Carlos',
            last_name: 'Gómez',
            phone: '1234567890',
            role: 'PROFESSIONAL',
            slug: 'carlos-gomez',
            // Para que la cuenta de prueba entre derecho al panel en vez de
            // caer en el onboarding o en el cartel de prueba vencida.
            onboarding_completed: true,
            trial_ends_at: trialEndsAt(),
        },
    });

    // La cuenta atiende a través de un miembro: un profesional que trabaja solo
    // es un equipo de uno (ver el comentario de TeamMember en el schema).
    const owner = await prisma.teamMember.create({
        data: {
            account_id: professional.id,
            name: 'Carlos Gómez',
            is_owner: true,
        },
    });

    await prisma.professionalService.createMany({
        data: [
            {
                user_id: professional.id,
                team_member_id: owner.id,
                service_id: corteCabello.id,
                duration: 30,
                price: 5000,
            },
            {
                user_id: professional.id,
                team_member_id: owner.id,
                service_id: corteBarba.id,
                duration: 20,
                price: 3500,
            },
        ],
    });

    // Lunes a viernes, 9:00 a 18:00.
    await prisma.availability.createMany({
        data: [1, 2, 3, 4, 5].map((weekday) => ({
            user_id: professional.id,
            team_member_id: owner.id,
            weekday,
            start_minutes: 9 * 60,
            end_minutes: 18 * 60,
        })),
    });

    console.log('Seed OK:');
    console.log('  professional_id:', professional.id);
    console.log('  team_member_id:', owner.id);
    console.log('  corte_cabello_id:', corteCabello.id);
    console.log('  corte_barba_id:', corteBarba.id);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
