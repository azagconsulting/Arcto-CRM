export type UserRole = "ADMIN" | "COORDINATOR" | "AGENT" | "VIEWER";

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  headline?: string | null;
  phone?: string | null;
  location?: string | null;
  pronouns?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  calendlyUrl?: string | null;
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
   processedAt?: string | null;
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
export type MessageCategory = "ANGEBOT" | "KRITISCH" | "KUENDIGUNG" | "WERBUNG" | "SONSTIGES";

export interface CustomerMessageContact {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  channel?: string | null;
}

export interface CustomerMessageAttachment {
  name: string;
  type?: string | null;
  size?: number | null;
  data?: string | null;
}

export interface CustomerMessage {
  id: string;
  customerId?: string | null;
  leadId?: string | null;
  contact: CustomerMessageContact | null;
  direction: CustomerMessageDirection;
  status: CustomerMessageStatus;
  subject?: string | null;
  preview?: string | null;
  body: string;
  fromEmail?: string | null;
  toEmail?: string | null;
  attachments?: CustomerMessageAttachment[];
  readAt?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  
  // AI Analysis
  category?: MessageCategory | null;
  sentiment?: string | null;
  urgency?: string | null;
  summary?: string | null;
  analyzedAt?: string | null;
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

export type SmtpEncryption = "none" | "ssl" | "tls";

export interface SmtpSettings {
  host: string;
  port: number;
  username: string;
  fromName?: string | null;
  fromEmail?: string | null;
  encryption: SmtpEncryption;
  hasPassword: boolean;
  updatedAt: string;
}

export type ImapEncryption = "none" | "ssl" | "tls";

export interface ImapSettings {
  host: string;
  port: number;
  username: string;
  mailbox: string;
  encryption: ImapEncryption;
  hasPassword: boolean;
  sinceDays?: number;
  updatedAt: string;
  verifiedAt?: string | null;
}

export interface ApiSettings {
  embedUrl: string | null;
  apiToken: string | null;
  hasServiceAccount: boolean;
  updatedAt?: string;
  serviceAccountJson?: string | null;
}

export interface WorkspaceAddress {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface WorkspaceBranding {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
}

export interface WorkspaceSocialLinks {
  website?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  youtube?: string | null;
}

export interface WorkspaceSettings {
  companyName?: string | null;
  legalName?: string | null;
  industry?: string | null;
  tagline?: string | null;
  mission?: string | null;
  vision?: string | null;
  description?: string | null;
  foundedYear?: number | null;
  teamSize?: number | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  timezone?: string | null;
  currency?: string | null;
  vatNumber?: string | null;
  registerNumber?: string | null;
  address?: WorkspaceAddress;
  branding?: WorkspaceBranding;
  social?: WorkspaceSocialLinks;
  updatedAt?: string;
}

export interface CreateEmployeeResponse {
  user: AuthUser;
  temporaryPassword?: string | null;
}

export interface LeadMessageListResponse {
  lead: Lead;
  items: CustomerMessage[];
}
