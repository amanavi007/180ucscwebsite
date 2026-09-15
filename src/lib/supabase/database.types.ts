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

export type TaskType = "preliminary_research" | "implementables" | "deliverable" | "other";

export type TaskStageStep =
  | "draft_in_progress"
  | "draft_complete"
  | "revisions_in_progress"
  | "complete";

export type MeetingNoteType = "client_call" | "officer_meeting" | "team_checkin";

export type AttendanceMark = "excused" | "unexcused" | "tardy";

export type MembershipTeamRole = "pm" | "sc" | "member";

export type LeadCandidateRole = "pm" | "sc";

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
          onboarding_completed_at: string | null;
          archived_at: string | null;
          departure_reason: "graduated" | "left" | null;
          current_title: string | null;
          current_company: string | null;
          linkedin_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          role?: UserRole;
          must_reset_password?: boolean;
          onboarding_completed_at?: string | null;
          archived_at?: string | null;
          departure_reason?: "graduated" | "left" | null;
          current_title?: string | null;
          current_company?: string | null;
          linkedin_url?: string | null;
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
          client_id: string | null;
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
          client_id?: string | null;
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
      clients: {
        Row: {
          id: string;
          name: string;
          contact_name: string | null;
          contact_email: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          contact_name?: string | null;
          contact_email?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          team_role: MembershipTeamRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          team_role?: MembershipTeamRole;
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
          stage_step: TaskStageStep | null;
          is_default_task: boolean;
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
          stage_step?: TaskStageStep | null;
          is_default_task?: boolean;
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
      quick_links: {
        Row: {
          id: string;
          title: string;
          url: string;
          description: string | null;
          category: string | null;
          sort_order: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          url: string;
          description?: string | null;
          category?: string | null;
          sort_order?: number;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quick_links"]["Insert"]>;
        Relationships: [];
      };
      room_hotspots: {
        Row: {
          id: string;
          name: string;
          top: number;
          left: number;
          width: number;
          height: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          top: number;
          left: number;
          width: number;
          height: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["room_hotspots"]["Insert"]>;
        Relationships: [];
      };
      lead_candidates: {
        Row: {
          id: string;
          quarter_id: string;
          user_id: string;
          candidate_role: LeadCandidateRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          quarter_id: string;
          user_id: string;
          candidate_role: LeadCandidateRole;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_candidates"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_label: string | null;
          detail: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          target_label?: string | null;
          detail?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
      meeting_dates: {
        Row: {
          id: string;
          quarter_id: string;
          date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          quarter_id: string;
          date: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meeting_dates"]["Insert"]>;
        Relationships: [];
      };
      org_events: {
        Row: {
          id: string;
          title: string;
          date: string;
          time: string | null;
          location: string | null;
          description: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          date: string;
          time?: string | null;
          location?: string | null;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["org_events"]["Insert"]>;
        Relationships: [];
      };
      project_events: {
        Row: {
          id: string;
          project_id: string;
          consultant_id: string | null;
          title: string;
          date: string;
          time: string | null;
          location: string | null;
          description: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          consultant_id?: string | null;
          title: string;
          date: string;
          time?: string | null;
          location?: string | null;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_events"]["Insert"]>;
        Relationships: [];
      };
      notification_reads: {
        Row: {
          user_id: string;
          last_read_at: string;
        };
        Insert: {
          user_id: string;
          last_read_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_reads"]["Insert"]>;
        Relationships: [];
      };
      exec_todos: {
        Row: {
          id: string;
          title: string;
          due_date: string | null;
          assigned_to: string[];
          status: "open" | "done";
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          due_date?: string | null;
          assigned_to?: string[];
          status?: "open" | "done";
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["exec_todos"]["Insert"]>;
        Relationships: [];
      };
      room_bookings: {
        Row: {
          id: string;
          project_id: string;
          date: string;
          room_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          date: string;
          room_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["room_bookings"]["Insert"]>;
        Relationships: [];
      };
      team_plans: {
        Row: {
          id: string;
          quarter_id: string;
          name: string;
          is_finalized: boolean;
          finalized_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quarter_id: string;
          name: string;
          is_finalized?: boolean;
          finalized_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_plans"]["Insert"]>;
        Relationships: [];
      };
      team_plan_teams: {
        Row: {
          id: string;
          plan_id: string;
          client_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          client_name: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_plan_teams"]["Insert"]>;
        Relationships: [];
      };
      team_plan_placements: {
        Row: {
          id: string;
          plan_id: string;
          plan_team_id: string;
          user_id: string;
          team_role: MembershipTeamRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          plan_team_id: string;
          user_id: string;
          team_role?: MembershipTeamRole;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_plan_placements"]["Insert"]>;
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
          email: string;
        };
        Relationships: [];
      };
      alumni_view: {
        Row: {
          user_id: string;
          name: string;
          role: UserRole;
          email: string;
          archived_at: string;
          current_title: string | null;
          current_company: string | null;
          linkedin_url: string | null;
          project_id: string | null;
          client_name: string | null;
          quarter_name: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      member_has_history: {
        Args: { target: string };
        Returns: boolean;
      };
    };
  };
}
