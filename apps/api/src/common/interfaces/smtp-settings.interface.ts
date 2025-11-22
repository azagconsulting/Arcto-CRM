export type SmtpEncryption = 'none' | 'ssl' | 'tls';

export interface SmtpCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  fromName?: string | null;
  fromEmail?: string | null;
  encryption: SmtpEncryption;
}

export interface SmtpSettingsResponse {
  host: string;
  port: number;
  username: string;
  fromName?: string | null;
  fromEmail?: string | null;
  encryption: SmtpEncryption;
  hasPassword: boolean;
  updatedAt: string;
}
