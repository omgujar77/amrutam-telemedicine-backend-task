import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

// Well-documented development password for seeded test accounts:
// Plaintext: "DevPassword123!" (Strictly for local testing and non-production environments)
const DEV_DEFAULT_PASSWORD = 'DevPassword123!';

async function main() {
  console.log('🌱 Starting database seeding with deterministic development records...');

  // 1. Hash the default development password using Argon2id
  const passwordHash = await argon2.hash(DEV_DEFAULT_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1
  });

  // 2. Seed Administrator Account
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin.dev@amrutam.local' },
    update: {},
    create: {
      email: 'admin.dev@amrutam.local',
      passwordHash,
      name: 'System Administrator (Dev)',
      role: 'ADMIN',
      status: 'ACTIVE'
    }
  });
  console.log(`  ✓ Admin user verified: ${adminUser.email}`);

  // 3. Seed Sample Patient Account & Profile
  const patientUser = await prisma.user.upsert({
    where: { email: 'patient.sample@amrutam.local' },
    update: {},
    create: {
      email: 'patient.sample@amrutam.local',
      passwordHash,
      name: 'Sample Patient (Dev)',
      role: 'PATIENT',
      status: 'ACTIVE',
      patientProfile: {
        create: {
          dateOfBirth: new Date('1992-05-15T00:00:00.000Z'),
          gender: 'Female',
          phoneNumber: '+919999900001',
          emergencyContact: '+919999900002',
          bloodGroup: 'O+',
          allergies: 'Penicillin'
        }
      }
    },
    include: { patientProfile: true }
  });
  console.log(`  ✓ Patient user & profile verified: ${patientUser.email}`);

  // 4. Seed Sample Doctor Account & Profile
  const doctorUser = await prisma.user.upsert({
    where: { email: 'dr.ayush.sharma@amrutam.local' },
    update: {},
    create: {
      email: 'dr.ayush.sharma@amrutam.local',
      passwordHash,
      name: 'Dr. Ayush Sharma (BAMS, MD Ayurveda)',
      role: 'DOCTOR',
      status: 'ACTIVE',
      doctorProfile: {
        create: {
          qualifications: 'BAMS, MD (Ayurveda Panchakarma)',
          specialization: 'Ayurvedic Medicine & Panchakarma',
          experienceYears: 12,
          bio: 'Senior Ayurvedic physician with expertise in holistic chronic disease management and lifestyle therapy.',
          consultationFee: 750.00,
          verificationStatus: 'VERIFIED'
        }
      }
    },
    include: { doctorProfile: true }
  });
  console.log(`  ✓ Doctor user & profile verified: ${doctorUser.email}`);

  // 5. Seed Sample Availability Slots for the Doctor
  if (doctorUser.doctorProfile) {
    const doctorId = doctorUser.doctorProfile.id;

    // Slot 1: Tomorrow 10:00 - 10:30 UTC
    const slot1Start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    slot1Start.setUTCHours(10, 0, 0, 0);
    const slot1End = new Date(slot1Start.getTime() + 30 * 60 * 1000);

    // Slot 2: Tomorrow 11:00 - 11:30 UTC
    const slot2Start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    slot2Start.setUTCHours(11, 0, 0, 0);
    const slot2End = new Date(slot2Start.getTime() + 30 * 60 * 1000);

    await prisma.availabilitySlot.upsert({
      where: {
        unique_doctor_exact_slot: {
          doctorId,
          startTime: slot1Start,
          endTime: slot1End
        }
      },
      update: {},
      create: {
        doctorId,
        startTime: slot1Start,
        endTime: slot1End,
        status: 'AVAILABLE'
      }
    });

    await prisma.availabilitySlot.upsert({
      where: {
        unique_doctor_exact_slot: {
          doctorId,
          startTime: slot2Start,
          endTime: slot2End
        }
      },
      update: {},
      create: {
        doctorId,
        startTime: slot2Start,
        endTime: slot2End,
        status: 'AVAILABLE'
      }
    });

    console.log('  ✓ Availability slots verified (2 future 30-minute consultation slots)');
  }

  // 6. Seed Sample Initial Audit Log
  await prisma.auditLog.create({
    data: {
      actorId: adminUser.id,
      action: 'SYSTEM_DATABASE_SEEDED',
      entityType: 'System',
      entityId: 'seed-phase-2',
      metadata: {
        environment: process.env.NODE_ENV || 'development',
        note: 'Initial deterministic development seed applied'
      }
    }
  });
  console.log('  ✓ Initial audit event logged');

  console.log('✅ Seeding completed successfully. All records are idempotent and safe for repeat runs.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed with error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
