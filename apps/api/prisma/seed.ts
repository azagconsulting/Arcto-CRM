import {
  CustomerActivityStatus,
  CustomerHealth,
  CustomerMessageDirection,
  CustomerMessageStatus,
  CustomerSegment,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

type SeedContact = {
  name: string;
  role?: string;
  channel?: string;
  email?: string;
};

type SeedActivity = {
  title: string;
  detail?: string;
  channel?: string;
  status: CustomerActivityStatus;
  scheduledAt?: Date;
  completedAt?: Date;
};

type SeedMessage = {
  contact?: string;
  direction: CustomerMessageDirection;
  subject?: string;
  body: string;
  fromEmail?: string;
  toEmail?: string;
  preview?: string;
  sentAt?: Date;
  receivedAt?: Date;
};

type SeedCustomer = {
  name: string;
  segment: CustomerSegment;
  ownerName: string;
  region: string;
  health: CustomerHealth;
  mrrCents: number;
  lastContactAt: Date;
  nextStep?: string;
  nextStepDueAt?: Date;
  decisionStage?: string;
  preferredChannel?: string;
  tags: string[];
  contacts: SeedContact[];
  activities: SeedActivity[];
  messages?: SeedMessage[];
};

async function main() {
  await prisma.customerMessage.deleteMany();
  await prisma.customerActivity.deleteMany();
  await prisma.customerContact.deleteMany();
  await prisma.customer.deleteMany();

  const customers: SeedCustomer[] = [
    {
      name: 'Nordwind AG',
      segment: CustomerSegment.ENTERPRISE,
      ownerName: 'Mara Schneider',
      region: 'Berlin',
      health: CustomerHealth.GOOD,
      mrrCents: 38200 * 100,
      lastContactAt: hoursAgo(2),
      nextStep: 'QBR · 12. Feb',
      nextStepDueAt: new Date('2025-02-12T08:00:00.000Z'),
      decisionStage: 'Renewal',
      preferredChannel: 'E-Mail',
      tags: ['Industry', 'ERP'],
      contacts: [
        {
          name: 'Anke Ritter',
          role: 'CIO',
          channel: 'E-Mail',
          email: 'anke.ritter@nordwind.de',
        },
        {
          name: 'Jasper Fromm',
          role: 'Ops Lead',
          channel: 'Call',
          email: 'jasper.fromm@nordwind.de',
        },
      ],
      activities: [
        {
          title: 'Renewal Deck abgestimmt',
          detail: 'Finance wartet auf finale Rabattstaffel',
          channel: 'Docs',
          status: CustomerActivityStatus.WAITING,
          scheduledAt: new Date('2025-02-11T13:00:00.000Z'),
        },
        {
          title: 'QBR dry-run',
          detail: 'Interne Agenda bestätigt',
          channel: 'Video',
          status: CustomerActivityStatus.SCHEDULED,
          scheduledAt: new Date('2025-02-12T08:00:00.000Z'),
        },
        {
          title: 'License Top-up',
          detail: '20 Seats aktiviert',
          channel: 'E-Mail',
          status: CustomerActivityStatus.DONE,
          scheduledAt: new Date('2025-02-08T09:00:00.000Z'),
          completedAt: new Date('2025-02-08T09:45:00.000Z'),
        },
      ],
      messages: [
        {
          contact: 'Anke Ritter',
          direction: CustomerMessageDirection.INBOUND,
          subject: 'Feedback zum Renewal Deck',
          body: 'Hi Mara,\nwir haben das Draft durchgesehen. Finance würde gern die Staffelpreise auf Folie 5 ergänzen. Können wir das noch heute bekommen?\n\nDanke dir,\nAnke',
          fromEmail: 'anke.ritter@nordwind.de',
          toEmail: 'mara@arcto.app',
          preview: 'Finance hätte gern die Staffelpreise auf Folie 5 ...',
          receivedAt: hoursAgo(1.5),
        },
        {
          contact: 'Anke Ritter',
          direction: CustomerMessageDirection.OUTBOUND,
          subject: 'QBR Agenda & Prep',
          body: 'Hi Anke,\nwir sind on track für Mittwoch. Ich habe die Agenda angehängt und eure offenen Punkte bereits eingeplant. Ruf mich, falls du kurzfristig Ergänzungen hast.\n\nViele Grüße\nMara',
          fromEmail: 'mara@arcto.app',
          toEmail: 'anke.ritter@nordwind.de',
          preview: 'Ich habe die Agenda angehängt und eure Punkte ...',
          sentAt: hoursAgo(3),
        },
        {
          contact: 'Jasper Fromm',
          direction: CustomerMessageDirection.INBOUND,
          subject: 'Prod API Warnung',
          body: 'Moin Mara,\nkurzer Hinweis: Unsere Ops haben seit heute früh 2-3 API-Spikes gesehen. Gibt es auf eurer Seite Deployments, die wir beachten sollten?\n\nDanke,\nJasper',
          fromEmail: 'jasper.fromm@nordwind.de',
          toEmail: 'support@arcto.app',
          preview: 'Unsere Ops sehen API-Spikes, gab es Deployments?',
          receivedAt: hoursAgo(8),
        },
      ],
    },
    {
      name: 'Helix Logistics',
      segment: CustomerSegment.SCALE,
      ownerName: 'Jonas Pohl',
      region: 'Hamburg',
      health: CustomerHealth.ATTENTION,
      mrrCents: 12900 * 100,
      lastContactAt: hoursAgo(24),
      nextStep: 'Lizenz-Upgrades',
      nextStepDueAt: new Date('2025-02-15T09:30:00.000Z'),
      decisionStage: 'Expansion',
      preferredChannel: 'Video',
      tags: ['Transport', 'API'],
      contacts: [
        {
          name: 'Lea Vogt',
          role: 'Head of Ops',
          channel: 'Video',
          email: 'lea.vogt@helixlog.de',
        },
      ],
      activities: [
        {
          title: 'API Throughput Analyse',
          detail: 'Support meldet erhöhte Fehlerraten',
          channel: 'Call',
          status: CustomerActivityStatus.WAITING,
          scheduledAt: hoursAgo(4),
        },
        {
          title: 'Upgrade-Angebot gesendet',
          detail: 'DocuSign wartet auf Freigabe',
          channel: 'Docs',
          status: CustomerActivityStatus.WAITING,
          scheduledAt: new Date('2025-02-09T10:00:00.000Z'),
        },
      ],
      messages: [
        {
          contact: 'Lea Vogt',
          direction: CustomerMessageDirection.OUTBOUND,
          subject: 'Upgrade-Angebot',
          body: 'Hi Lea,\nwie besprochen findest du im Anhang das Upgrade-Angebot mit flexiblen Seats.\n\nFalls ihr Fragen zum Pricing habt, melde dich jederzeit.\n\nAlles Liebe\nJonas',
          fromEmail: 'jonas@arcto.app',
          toEmail: 'lea.vogt@helixlog.de',
          preview: 'Hier ist das Upgrade-Angebot mit flexiblen Seats.',
          sentAt: hoursAgo(18),
        },
        {
          contact: 'Lea Vogt',
          direction: CustomerMessageDirection.INBOUND,
          subject: 'Re: Upgrade-Angebot',
          body: 'Hey Jonas,\nwir prüfen gerade intern. Kannst du mir parallel schicken, wie sich das Monitoring verbessert? Unser CIO fragt konkret nach KPIs.\n\nDanke dir!\nLea',
          fromEmail: 'lea.vogt@helixlog.de',
          toEmail: 'jonas@arcto.app',
          preview: 'Wir prüfen intern und benötigen Monitoring KPIs.',
          receivedAt: hoursAgo(6),
        },
      ],
    },
    {
      name: 'Studio 27',
      segment: CustomerSegment.TRIAL,
      ownerName: 'Helena Voigt',
      region: 'Köln',
      health: CustomerHealth.RISK,
      mrrCents: 3400 * 100,
      lastContactAt: hoursAgo(4),
      nextStep: 'Onboarding Call',
      nextStepDueAt: new Date('2025-02-13T09:00:00.000Z'),
      decisionStage: 'Trial',
      preferredChannel: 'Chat',
      tags: ['Creative', 'Trial'],
      contacts: [
        {
          name: 'Milo Graf',
          role: 'Founder',
          channel: 'E-Mail',
          email: 'milo@studio27.io',
        },
      ],
      activities: [
        {
          title: 'Usage Drop erkannt',
          detail: 'Nur 2 aktive Seats in letzter Woche',
          channel: 'Alert',
          status: CustomerActivityStatus.WAITING,
          scheduledAt: hoursAgo(1),
        },
        {
          title: 'Success Plan gesendet',
          detail: 'Workshop-Vorschlag offen',
          channel: 'E-Mail',
          status: CustomerActivityStatus.DONE,
          scheduledAt: new Date('2025-02-07T11:00:00.000Z'),
          completedAt: new Date('2025-02-07T11:30:00.000Z'),
        },
      ],
      messages: [
        {
          contact: 'Milo Graf',
          direction: CustomerMessageDirection.INBOUND,
          subject: 'Trial Feedback',
          body: 'Hey Team,\nwir kommen mit dem Onboarding gut voran, aber Templates für Agentur-Workflow fehlen uns noch. Gibt es dazu schon Material?\n\nLG\nMilo',
          fromEmail: 'milo@studio27.io',
          toEmail: 'success@arcto.app',
          preview: 'Templates für Agentur-Workflows fehlen im Trial.',
          receivedAt: hoursAgo(4),
        },
      ],
    },
    {
      name: 'Arctic Systems',
      segment: CustomerSegment.ENTERPRISE,
      ownerName: 'Mara Schneider',
      region: 'München',
      health: CustomerHealth.GOOD,
      mrrCents: 21600 * 100,
      lastContactAt: new Date(),
      nextStep: 'Renewal Draft',
      nextStepDueAt: new Date('2025-02-14T10:30:00.000Z'),
      decisionStage: 'Commercial',
      preferredChannel: 'Call',
      tags: ['Cloud', 'Partner'],
      contacts: [
        {
          name: 'Daniel Kluge',
          role: 'CTO',
          channel: 'Call',
          email: 'daniel.kluge@arctic.systems',
        },
        {
          name: 'Sofia Brand',
          role: 'Finance',
          channel: 'Docs',
          email: 'sofia.brand@arctic.systems',
        },
      ],
      activities: [
        {
          title: 'Security Review abgeschlossen',
          detail: 'DSGVO-Check ✓',
          channel: 'Docs',
          status: CustomerActivityStatus.DONE,
          scheduledAt: new Date('2025-02-10T12:00:00.000Z'),
          completedAt: new Date('2025-02-10T13:30:00.000Z'),
        },
        {
          title: 'Exec Alignment',
          detail: 'Budget-Freigabe erwartet',
          channel: 'Video',
          status: CustomerActivityStatus.SCHEDULED,
          scheduledAt: new Date('2025-02-14T10:30:00.000Z'),
        },
      ],
      messages: [
        {
          contact: 'Sofia Brand',
          direction: CustomerMessageDirection.INBOUND,
          subject: 'Budgetfreigabe Update',
          body: 'Hallo Mara,\ndie Freigabe liegt nun beim CFO. Kannst du uns bis morgen Vormittag eine kurze Kostenaufschlüsselung schicken?\n\nViele Grüße\nSofia',
          fromEmail: 'sofia.brand@arctic.systems',
          toEmail: 'mara@arcto.app',
          preview: 'Freigabe beim CFO – bitte Kostenaufschlüsselung schicken.',
          receivedAt: hoursAgo(10),
        },
        {
          contact: 'Daniel Kluge',
          direction: CustomerMessageDirection.OUTBOUND,
          subject: 'Security Review Follow-up',
          body: 'Hi Daniel,\nnur als Follow-up: Das Security-Team hat alle Findings resolved. Dein Team sollte die aktualisierte DPA bereits bekommen haben.\n\nLG\nMara',
          fromEmail: 'mara@arcto.app',
          toEmail: 'daniel.kluge@arctic.systems',
          preview: 'Security-Team hat alle Findings resolved – DPA ist raus.',
          sentAt: hoursAgo(12),
        },
      ],
    },
  ];

  for (const entry of customers) {
    const created = await prisma.customer.create({
      data: {
        name: entry.name,
        segment: entry.segment,
        ownerName: entry.ownerName,
        region: entry.region,
        health: entry.health,
        mrrCents: entry.mrrCents,
        lastContactAt: entry.lastContactAt,
        nextStep: entry.nextStep,
        nextStepDueAt: entry.nextStepDueAt,
        decisionStage: entry.decisionStage,
        preferredChannel: entry.preferredChannel,
        tags: entry.tags,
        contacts: {
          create: entry.contacts,
        },
        activities: {
          create: entry.activities,
        },
      },
      include: {
        contacts: true,
      },
    });

    for (const message of entry.messages ?? []) {
      const contact = message.contact
        ? created.contacts.find((item) => item.name === message.contact)
        : null;

      await prisma.customerMessage.create({
        data: {
          customerId: created.id,
          contactId: contact?.id,
          direction: message.direction,
          status: CustomerMessageStatus.SENT,
          subject: message.subject,
          preview: message.preview,
          body: message.body,
          fromEmail: message.fromEmail,
          toEmail: message.toEmail ?? contact?.email,
          sentAt: message.sentAt,
          receivedAt: message.receivedAt,
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
