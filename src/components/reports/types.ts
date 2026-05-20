/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ReportsTabProps {
  projects: any[];
  tasks: any[];
  expenses: any[];
  invoices: any[];
  timeEntries: any[];
  teamUsers: any[];
  dailyLogs: any[];
  rfis: any[];
  submittals: any[];
  punchItems: any[];
  dateLabel: string;
  showToast: (msg: string, type?: string) => void;
}
