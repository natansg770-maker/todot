export type ContactMethod = "phone" | "sms";

export type Role = {
  id: string;
  name: string;
  sortOrder: number;
};

export type Person = {
  id: string;
  name: string;
  roleId: string;
  isSenior: boolean;
  phone?: string;
  notes?: string;
};

export type AssignmentStatus = "pending" | "done";

export type Assignment = {
  id: string;
  assigneeId: string;
  recipientId: string;
  status: AssignmentStatus;
  contactMethod?: ContactMethod | null;
  feedback?: string;
  needsAdditionalThanks?: boolean;
  additionalThankerIds?: string[];
  additionalThankerNote?: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Database = {
  roles: Role[];
  people: Person[];
  assignments: Assignment[];
  updatedAt: string;
};

export type Stats = {
  totalRecipients: number;
  assignedRecipients: number;
  completedRecipients: number;
  pendingAssignments: number;
  doneAssignments: number;
  unassignedRecipients: number;
  additionalThanksNeeded: number;
};
