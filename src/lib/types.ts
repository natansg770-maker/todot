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
  /** Only admins see the management tab and can change roster/assignments. */
  isAdmin?: boolean;
  phone?: string;
  notes?: string;
  /** scrypt hash in the form salt:hash — never send to clients. */
  passwordHash?: string;
  usesDefaultPassword?: boolean;
};

export const ADMIN_NAME = "נתן שמחה גרינברג";

export type AssignmentStatus = "pending" | "done";

export type Assignment = {
  id: string;
  assigneeId: string;
  recipientId: string;
  status: AssignmentStatus;
  /** Lower number = higher personal priority */
  priority?: number;
  contactMethod?: ContactMethod | null;
  feedback?: string;
  needsAdditionalThanks?: boolean;
  additionalThankerIds?: string[];
  additionalThankerNote?: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClaimRequestStatus = "pending" | "approved" | "rejected";

export type ClaimRequest = {
  id: string;
  recipientId: string;
  requesterId: string;
  targetAssigneeId: string;
  note?: string;
  status: ClaimRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type Database = {
  roles: Role[];
  people: Person[];
  assignments: Assignment[];
  claimRequests: ClaimRequest[];
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
  openClaimRequests: number;
};
