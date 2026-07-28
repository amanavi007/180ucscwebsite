export type UserRole =
  | "junior_consultant"
  | "consultant"
  | "senior_consultant"
  | "project_manager"
  | "director_of_projects"
  | "director_of_internal_affairs"
  | "director_of_external_affairs"
  | "director_of_marketing"
  | "director_of_training"
  | "president";

export type ProjectStatus =
  | "initial_research"
  | "issue_tree"
  | "preliminary_research"
  | "implementable_creation"
  | "deliverable_slide_work"
  | "presentation_practice"
  | "ready_for_final_deliverable"
  | "archived";

export type ProjectHealth = "on_track" | "at_risk" | "blocked";

export type TaskStatus = "not_started" | "in_progress" | "done";

export type TaskPriority = "low" | "medium" | "high";

export type TaskType =
  | "initial_research"
  | "issue_tree"
  | "preliminary_research"
  | "implementable_creation"
  | "deliverable_slide_work"
  | "presentation_practice"
  | "ready_for_final_deliverable";

export type MeetingNoteType = "client_call" | "officer_meeting" | "team_checkin";

export type AttendanceMark = "excused" | "unexcused" | "tardy";

export type WikiSection = "consultant" | "pm";

export interface Database {
  public: {
    Tables: {
      quarters: {
        Row: {
          id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          start_date: string;
          end_date: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quarters"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          role: UserRole;
          must_reset_password: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          role?: UserRole;
          must_reset_password?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          quarter_id: string;
          client_name: string;
          status: ProjectStatus;
          project_manager_id: string | null;
          senior_consultant_id: string | null;
          industry: string | null;
          health: ProjectHealth;
          health_manual_override: ProjectHealth | null;
          start_date: string | null;
          deadline: string | null;
          deliverable_link: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quarter_id: string;
          client_name: string;
          status?: ProjectStatus;
          project_manager_id?: string | null;
          senior_consultant_id?: string | null;
          industry?: string | null;
          health?: ProjectHealth;
          health_manual_override?: ProjectHealth | null;
          start_date?: string | null;
          deadline?: string | null;
          deliverable_link?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["memberships"]["Insert"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          task_name: string;
          assignee_id: string | null;
          due_date: string | null;
          status: TaskStatus;
          priority: TaskPriority;
          task_type: TaskType;
          parent_task_id: string | null;
          is_milestone: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          task_name: string;
          assignee_id?: string | null;
          due_date?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          task_type: TaskType;
          parent_task_id?: string | null;
          is_milestone?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      meeting_notes: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          date: string;
          type: MeetingNoteType;
          body: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title: string;
          date: string;
          type: MeetingNoteType;
          body?: string;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meeting_notes"]["Insert"]>;
        Relationships: [];
      };
      attendance_sessions: {
        Row: {
          id: string;
          project_id: string;
          date: string;
          taken_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          date: string;
          taken_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["attendance_sessions"]["Insert"]>;
        Relationships: [];
      };
      attendance_marks: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          mark: AttendanceMark;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          mark: AttendanceMark;
        };
        Update: Partial<Database["public"]["Tables"]["attendance_marks"]["Insert"]>;
        Relationships: [];
      };
      wiki_pages: {
        Row: {
          id: string;
          section: WikiSection;
          parent_id: string | null;
          title: string;
          slug: string;
          body: string;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          section: WikiSection;
          parent_id?: string | null;
          title: string;
          slug: string;
          body?: string;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wiki_pages"]["Insert"]>;
        Relationships: [];
      };
      org_settings: {
        Row: { key: string; value: string };
        Insert: { key: string; value: string };
        Update: Partial<Database["public"]["Tables"]["org_settings"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      directory_view: {
        Row: {
          user_id: string;
          name: string;
          role: UserRole;
          project_id: string | null;
          client_name: string | null;
          quarter_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
}
