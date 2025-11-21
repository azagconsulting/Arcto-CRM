export type UserRole = "ADMIN" | "COORDINATOR" | "AGENT" | "VIEWER";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRole;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export type LeadStatus =
  | "NEW"
  | "QUALIFIED"
  | "IN_PROGRESS"
  | "WON"
  | "LOST"
  | "ARCHIVED";

export type LeadPriority = "LOW" | "MEDIUM" | "HIGH";

export interface LeadAssignment {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  role: UserRole;
}

export interface Lead {
  id: string;
  fullName: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  message?: string | null;
  routingLabel?: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  createdAt: string;
  updatedAt: string;
  assignedTo?: LeadAssignment | null;
}

export interface LeadWorkflowSettings {
  id: string;
  notifyEmail?: string | null;
  routingHeadline?: string | null;
  routingDescription?: string | null;
  autoResponderEnabled: boolean;
  autoResponderMessage?: string | null;
  autoAssignUser?: LeadAssignment | null;
  autoAssignUserId?: string | null;
}

export interface LeadTimelineEntry {
  id: string;
  leadId: string;
  status: LeadStatus;
  note?: string | null;
  createdAt: string;
  user?: LeadAssignment | null;
}

export interface ApiErrorPayload {
  message?: string;
  error?: string;
  statusCode?: number;
  issues?: string[];
}

export interface BlogAuthor {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content: string;
  coverImage?: string | null;
  featured: boolean;
  published: boolean;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  author?: BlogAuthor | null;
}

export interface BlogPostListResponse {
  items: BlogPost[];
  stats?: {
    total: number;
    published: number;
    drafts: number;
  };
}

export type CustomerSegment = 'ENTERPRISE' | 'SCALE' | 'TRIAL';
export type CustomerHealth = 'GOOD' | 'ATTENTION' | 'RISK';
export type CustomerActivityStatus = 'SCHEDULED' | 'DONE' | 'WAITING';

export interface CustomerContact {
  id: string;
  name: string;
  role?: string | null;
  channel?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerActivity {
  id: string;
  title: string;
  detail?: string | null;
  channel?: string | null;
  status: CustomerActivityStatus;
  scheduledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  segment: CustomerSegment;
  ownerName?: string | null;
  region?: string | null;
  health: CustomerHealth;
  mrrCents: number;
  lastContactAt?: string | null;
  nextStep?: string | null;
  nextStepDueAt?: string | null;
  decisionStage?: string | null;
  preferredChannel?: string | null;
  tags: string[];
  contacts: CustomerContact[];
  activities: CustomerActivity[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListResponse {
  items: Customer[];
  stats: {
    total: number;
    atRisk: number;
    enterprise: number;
    scheduledMeetings: number;
    totalMrrCents: number;
  };
}

export type CustomerMessageDirection = "INBOUND" | "OUTBOUND";

export type CustomerMessageStatus = "DRAFT" | "QUEUED" | "SENDING" | "SENT" | "FAILED";

export interface CustomerMessageContact {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  channel?: string | null;
}

export interface CustomerMessage {
  id: string;
  customerId: string;
  contact: CustomerMessageContact | null;
  direction: CustomerMessageDirection;
  status: CustomerMessageStatus;
  subject?: string | null;
  preview?: string | null;
  body: string;
  fromEmail?: string | null;
  toEmail?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerMessageListResponse {
  customer: {
    id: string;
    name: string;
    contacts: CustomerMessageContact[];
  };
  items: CustomerMessage[];
}

export interface CustomerImportResponse {
  imported: number;
  skipped: number;
  errors: string[];
}
