export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: 'paste' | 'file' | 'url';
  title: string | null;
  company: string | null;
  portal: 'linkedin' | 'naukri' | 'indeed' | 'workday' | 'greenhouse' | 'lever' | 'other' | null;
  url: string | null;
  jdText: string;
  requirementsJson: Record<string, unknown>;
  fitScore: number;
  status: 'new' | 'analyzed' | 'tailored' | 'ready' | 'applied' | 'closed';
}

export interface ResumeBuild {
  id: string;
  jobId: string;
  createdAt: string;
  baseResumeHash: string;
  tailoredTexPath: string;
  tailoredPdfPath: string;
  changesJsonPath: string;
  compileLogPath: string;
  pdfSha256: string;
  buildStatus: 'pending' | 'success' | 'failed';
}

export interface Application {
  id: string;
  jobId: string;
  resumeBuildId: string | null;
  status: 'drafted' | 'ready' | 'submitted' | 'interview' | 'rejected' | 'offer' | 'no_reply' | 'withdrawn';
  appliedAt: string | null;
  lastUpdate: string;
  notes: string | null;
  followUpDate: string | null;
}

export interface FieldMapping {
  id: string;
  portal: string;
  domain: string | null;
  mappingJson: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  lastUsedAt: string | null;
}

export interface Outcome {
  id: string;
  applicationId: string;
  outcome: 'interview' | 'rejected' | 'no_reply' | 'offer' | 'ghosted';
  outcomeDate: string;
  feedback: string | null;
  interviewRounds: number | null;
  learnedKeywords: string | null;
}

export interface Profile {
  id: string;
  updatedAt: string;
  profileJson: Record<string, unknown>;
  achievementsJson: unknown[];
  isEncrypted: boolean;
}

export interface ActivityLog {
  id: number;
  timestamp: string;
  operation: string;
  entityType: string;
  entityId: string | null;
  detailsJson: Record<string, unknown>;
  success: boolean;
}
