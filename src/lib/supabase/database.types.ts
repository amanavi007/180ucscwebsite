export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
  | "pm_sc_comments"
  | "awaiting_exec_revision"
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
          attendance_notice_seen_at: string | null;
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
          attendance_notice_seen_at?: string | null;
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
      task_exec_reviews: {
        Row: {
          task_id: string;
          exec_id: string;
          assigned_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          task_id: string;
          exec_id: string;
          assigned_at?: string;
          reviewed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["task_exec_reviews"]["Insert"]>;
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
          order_index: number;
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
          order_index?: number;
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
      outreach_prospects: {
        Row: {
          id: string;
          company: string;
          website: string | null;
          niche: string | null;
          size_stage: string | null;
          summary: string | null;
          why_fit: string | null;
          facts: Json;
          contact_name: string | null;
          contact_role: string | null;
          contact_email: string;
          contact_domain: string;
          status: string;
          status_reason: string | null;
          step: number;
          next_action_at: string | null;
          booking_token: string;
          last_sent_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company: string;
          website?: string | null;
          niche?: string | null;
          size_stage?: string | null;
          summary?: string | null;
          why_fit?: string | null;
          facts?: Json;
          contact_name?: string | null;
          contact_role?: string | null;
          contact_email: string;
          contact_domain: string;
          status?: string;
          status_reason?: string | null;
          step?: number;
          next_action_at?: string | null;
          booking_token?: string;
          last_sent_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["outreach_prospects"]["Insert"]>;
        Relationships: [];
      };
      outreach_messages: {
        Row: {
          id: string;
          prospect_id: string;
          step: number;
          subject: string;
          body_text: string;
          status: string;
          resend_id: string | null;
          scheduled_for: string | null;
          sent_at: string | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: string;
          step: number;
          subject: string;
          body_text: string;
          status?: string;
          resend_id?: string | null;
          scheduled_for?: string | null;
          sent_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["outreach_messages"]["Insert"]>;
        Relationships: [];
      };
      outreach_events: {
        Row: {
          id: string;
          prospect_id: string | null;
          message_id: string | null;
          kind: string;
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id?: string | null;
          message_id?: string | null;
          kind: string;
          detail?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["outreach_events"]["Insert"]>;
        Relationships: [];
      };
      outreach_discovery_candidates: {
        Row: {
          id: string;
          source: string;
          source_ref: string | null;
          company: string;
          website: string | null;
          domain: string;
          outcome: string;
          reason: string | null;
          prospect_id: string | null;
          email: string | null;
          email_source_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source?: string;
          source_ref?: string | null;
          company: string;
          website?: string | null;
          domain: string;
          outcome: string;
          reason?: string | null;
          prospect_id?: string | null;
          email?: string | null;
          email_source_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["outreach_discovery_candidates"]["Insert"]>;
        Relationships: [];
      };
      outreach_suppressions: {
        Row: { id: string; email: string | null; domain: string | null; reason: string; created_at: string };
        Insert: { id?: string; email?: string | null; domain?: string | null; reason: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["outreach_suppressions"]["Insert"]>;
        Relationships: [];
      };
      outreach_replies: {
        Row: {
          id: string;
          prospect_id: string | null;
          resend_email_id: string;
          from_email: string;
          subject: string;
          snippet: string;
          classification: string;
          forwarded_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id?: string | null;
          resend_email_id: string;
          from_email: string;
          subject: string;
          snippet: string;
          classification: string;
          forwarded_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["outreach_replies"]["Insert"]>;
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
      chat_threads: {
        Row: { id: string; user_id: string; title: string; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; title?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["chat_threads"]["Insert"]>;
        Relationships: [];
      };
      chat_messages: {
        Row: { id: string; thread_id: string; role: "user" | "assistant" | "system"; parts: unknown; created_at: string };
        Insert: { id?: string; thread_id: string; role: "user" | "assistant" | "system"; parts: unknown; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["chat_messages"]["Insert"]>;
        Relationships: [];
      };
      chat_proposals: {
        Row: {
          id: string;
          user_id: string;
          thread_id: string | null;
          tool: string;
          args: unknown;
          preview: string;
          status: "pending" | "rejected" | "expired" | "approved" | "executed" | "failed";
          error: string | null;
          created_at: string;
          expires_at: string;
          executed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          thread_id?: string | null;
          tool: string;
          args: unknown;
          preview: string;
          status?: "pending" | "rejected" | "expired" | "approved" | "executed" | "failed";
          error?: string | null;
          created_at?: string;
          expires_at?: string;
          executed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["chat_proposals"]["Insert"]>;
        Relationships: [];
      };
      chat_usage: {
        Row: { user_id: string; day: string; message_count: number; tokens_in: number; tokens_out: number };
        Insert: { user_id: string; day: string; message_count?: number; tokens_in?: number; tokens_out?: number };
        Update: Partial<Database["public"]["Tables"]["chat_usage"]["Insert"]>;
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
          logo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          client_name: string;
          logo_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_plan_teams"]["Insert"]>;
        Relationships: [];
      };
      team_profiles: {
        Row: {
          profile_id: string;
          bio: string | null;
          linkedin_url: string | null;
          major: string | null;
          photo_path: string | null;
          listed: boolean;
          pending_bio: string | null;
          pending_linkedin_url: string | null;
          pending_major: string | null;
          pending_photo_path: string | null;
          pending_submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          bio?: string | null;
          linkedin_url?: string | null;
          major?: string | null;
          photo_path?: string | null;
          listed?: boolean;
          pending_bio?: string | null;
          pending_linkedin_url?: string | null;
          pending_major?: string | null;
          pending_photo_path?: string | null;
          pending_submitted_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["team_profiles"]["Insert"]>;
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
      coffee_chat_availability: {
        Row: {
          id: string;
          exec_id: string;
          date: string;
          start_time: string;
          end_time: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          exec_id: string;
          date: string;
          start_time: string;
          end_time: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["coffee_chat_availability"]["Insert"]>;
        Relationships: [];
      };
      coffee_chat_slots: {
        Row: {
          id: string;
          date: string;
          start_time: string;
          end_time: string;
          location: string;
          exec_id_1: string;
          exec_id_2: string | null;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          start_time: string;
          end_time: string;
          location?: string;
          exec_id_1: string;
          exec_id_2?: string | null;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["coffee_chat_slots"]["Insert"]>;
        Relationships: [];
      };
      coffee_chat_bookings: {
        Row: {
          id: string;
          slot_id: string;
          applicant_name: string;
          applicant_email: string;
          status: string;
          manage_token: string;
          location: string;
          created_at: string;
          cancelled_at: string | null;
        };
        Insert: {
          id?: string;
          slot_id: string;
          applicant_name: string;
          applicant_email: string;
          status?: string;
          manage_token: string;
          location?: string;
          created_at?: string;
          cancelled_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["coffee_chat_bookings"]["Insert"]>;
        Relationships: [];
      };
      recruit_applicants: {
        Row: {
          id: string;
          quarter_id: string;
          name: string;
          email: string | null;
          major: string | null;
          year: string | null;
          notes: string;
          previous_applicant_id: string | null;
          merged_into_id: string | null;
          archived_at: string | null;
          created_by_batch_id: string | null;
          application_link: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quarter_id: string;
          name: string;
          email?: string | null;
          major?: string | null;
          year?: string | null;
          notes?: string;
          created_by_batch_id?: string | null;
          application_link?: string | null;
          previous_applicant_id?: string | null;
          merged_into_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_applicants"]["Insert"]>;
        Relationships: [];
      };
      recruit_applicant_aliases: {
        Row: { id: string; applicant_id: string; quarter_id: string; alias: string; created_at: string };
        Insert: { id?: string; applicant_id: string; quarter_id: string; alias: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_applicant_aliases"]["Insert"]>;
        Relationships: [];
      };
      recruit_categories: {
        Row: {
          id: string;
          name: string;
          section: "engagement" | "resume" | "interview";
          default_points: number;
          sort_order: number;
          archived_at: string | null;
          system_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          section: "engagement" | "resume" | "interview";
          default_points?: number;
          sort_order?: number;
          archived_at?: string | null;
          system_key?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_categories"]["Insert"]>;
        Relationships: [];
      };
      recruit_rubrics: {
        Row: { id: string; stage: "resume" | "interview"; scale_min: number; scale_max: number; updated_at: string };
        Insert: { id?: string; stage: "resume" | "interview"; scale_min?: number; scale_max?: number; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_rubrics"]["Insert"]>;
        Relationships: [];
      };
      recruit_rubric_criteria: {
        Row: {
          id: string;
          rubric_id: string;
          name: string;
          description: string;
          weight: number;
          sort_order: number;
          archived_at: string | null;
          answer_key: "why" | "teamwork" | "bring" | "resume" | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          rubric_id: string;
          name: string;
          description?: string;
          weight?: number;
          sort_order?: number;
          archived_at?: string | null;
          answer_key?: "why" | "teamwork" | "bring" | "resume" | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_rubric_criteria"]["Insert"]>;
        Relationships: [];
      };
      recruit_reviews: {
        Row: {
          id: string;
          applicant_id: string;
          stage: "resume" | "interview";
          reviewer_id: string;
          comment: string;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          applicant_id: string;
          stage: "resume" | "interview";
          reviewer_id: string;
          comment?: string;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_reviews"]["Insert"]>;
        Relationships: [];
      };
      recruit_applicant_answers: {
        Row: {
          applicant_id: string;
          submitted_at: string | null;
          graduation_term: string | null;
          how_heard: string | null;
          essay_why: string | null;
          essay_teamwork: string | null;
          essay_bring: string | null;
          resume_url: string | null;
          import_batch_id: string | null;
          updated_at: string;
        };
        Insert: {
          applicant_id: string;
          submitted_at?: string | null;
          graduation_term?: string | null;
          how_heard?: string | null;
          essay_why?: string | null;
          essay_teamwork?: string | null;
          essay_bring?: string | null;
          resume_url?: string | null;
          import_batch_id?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_applicant_answers"]["Insert"]>;
        Relationships: [];
      };
      recruit_review_assignments: {
        Row: { id: string; applicant_id: string; reviewer_id: string; stage: "resume" | "interview"; assigned_at: string };
        Insert: { id?: string; applicant_id: string; reviewer_id: string; stage?: "resume" | "interview"; assigned_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_review_assignments"]["Insert"]>;
        Relationships: [];
      };
      recruit_review_exclusions: {
        Row: { applicant_id: string; reviewer_id: string };
        Insert: { applicant_id: string; reviewer_id: string };
        Update: Partial<Database["public"]["Tables"]["recruit_review_exclusions"]["Insert"]>;
        Relationships: [];
      };
      recruit_review_reveals: {
        Row: { applicant_id: string; stage: "resume" | "interview"; revealed_by: string | null; revealed_at: string };
        Insert: { applicant_id: string; stage?: "resume" | "interview"; revealed_by?: string | null; revealed_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_review_reveals"]["Insert"]>;
        Relationships: [];
      };
      review_rubrics: {
        Row: { id: string; kind: "doc" | "slides"; version: number; criteria: unknown; guide_text: string; created_by: string | null; created_at: string };
        Insert: { id?: string; kind: "doc" | "slides"; version: number; criteria: unknown; guide_text?: string; created_by?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["review_rubrics"]["Insert"]>;
        Relationships: [];
      };
      prelim_reviews: {
        Row: {
          id: string; project_id: string; created_by: string; file_id: string; file_name: string; file_url: string;
          kind: "doc" | "slides"; rubric_version: number; status: "running" | "done" | "error";
          verdict: "ready" | "needs_work" | null; result: unknown; error_message: string | null; created_at: string;
        };
        Insert: {
          id?: string; project_id: string; created_by: string; file_id: string; file_name: string; file_url: string;
          kind: "doc" | "slides"; rubric_version: number; status?: "running" | "done" | "error";
          verdict?: "ready" | "needs_work" | null; result?: unknown; error_message?: string | null; created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["prelim_reviews"]["Insert"]>;
        Relationships: [];
      };
      recruit_review_scores: {
        Row: { id: string; review_id: string; criterion_id: string; score: number };
        Insert: { id?: string; review_id: string; criterion_id: string; score: number };
        Update: Partial<Database["public"]["Tables"]["recruit_review_scores"]["Insert"]>;
        Relationships: [];
      };
      recruit_ignored_names: {
        Row: { id: string; quarter_id: string; name: string; created_at: string };
        Insert: { id?: string; quarter_id: string; name: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_ignored_names"]["Insert"]>;
        Relationships: [];
      };
      recruit_booking_links: {
        Row: {
          id: string;
          booking_kind: "coffee_chat" | "interview";
          booking_id: string;
          applicant_id: string;
          status: "attended" | "no_show" | "excused";
          points_id: string | null;
          marked_by: string | null;
          marked_at: string;
        };
        Insert: {
          id?: string;
          booking_kind: "coffee_chat" | "interview";
          booking_id: string;
          applicant_id: string;
          status: "attended" | "no_show" | "excused";
          points_id?: string | null;
          marked_by?: string | null;
          marked_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_booking_links"]["Insert"]>;
        Relationships: [];
      };
      recruit_events: {
        Row: { id: string; quarter_id: string; category_id: string; name: string; date: string; created_at: string };
        Insert: { id?: string; quarter_id: string; category_id: string; name: string; date: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_events"]["Insert"]>;
        Relationships: [];
      };
      recruit_points: {
        Row: {
          id: string;
          applicant_id: string;
          category_id: string;
          event_id: string | null;
          points: number;
          reason: string | null;
          source: "manual" | "import" | "booking";
          batch_id: string | null;
          awarded_by: string | null;
          created_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
        };
        Insert: {
          id?: string;
          applicant_id: string;
          category_id: string;
          event_id?: string | null;
          points: number;
          reason?: string | null;
          source?: "manual" | "import" | "booking";
          batch_id?: string | null;
          awarded_by?: string | null;
          created_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_points"]["Insert"]>;
        Relationships: [];
      };
      recruit_not_duplicates: {
        Row: { applicant_a: string; applicant_b: string; created_at: string };
        Insert: { applicant_a: string; applicant_b: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["recruit_not_duplicates"]["Insert"]>;
        Relationships: [];
      };
      recruit_merge_log: {
        Row: {
          id: string;
          survivor_id: string;
          absorbed_id: string;
          moved_point_ids: string[];
          moved_alias_ids: string[];
          moved_link_ids: string[];
          added_alias_id: string | null;
          survivor_before: Record<string, string | null>;
          created_at: string;
          undone_at: string | null;
        };
        Insert: {
          id?: string;
          survivor_id: string;
          absorbed_id: string;
          moved_point_ids?: string[];
          moved_alias_ids?: string[];
          moved_link_ids?: string[];
          added_alias_id?: string | null;
          survivor_before: Record<string, string | null>;
          created_at?: string;
          undone_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["recruit_merge_log"]["Insert"]>;
        Relationships: [];
      };
      interview_invitees: {
        Row: { id: string; email: string; name: string | null; created_at: string };
        Insert: { id?: string; email: string; name?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["interview_invitees"]["Insert"]>;
        Relationships: [];
      };
      interview_availability: {
        Row: { id: string; exec_id: string; date: string; start_time: string; end_time: string; created_at: string };
        Insert: { id?: string; exec_id: string; date: string; start_time: string; end_time: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["interview_availability"]["Insert"]>;
        Relationships: [];
      };
      interview_slots: {
        Row: {
          id: string;
          date: string;
          start_time: string;
          end_time: string;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          start_time: string;
          end_time: string;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["interview_slots"]["Insert"]>;
        Relationships: [];
      };
      interview_slot_execs: {
        Row: { slot_id: string; exec_id: string };
        Insert: { slot_id: string; exec_id: string };
        Update: Partial<Database["public"]["Tables"]["interview_slot_execs"]["Insert"]>;
        Relationships: [];
      };
      interview_bookings: {
        Row: {
          id: string;
          slot_id: string;
          applicant_name: string;
          applicant_email: string;
          status: string;
          manage_token: string;
          reminder_day_before_sent_at: string | null;
          reminder_morning_sent_at: string | null;
          created_at: string;
          cancelled_at: string | null;
        };
        Insert: {
          id?: string;
          slot_id: string;
          applicant_name: string;
          applicant_email: string;
          status?: string;
          manage_token: string;
          reminder_day_before_sent_at?: string | null;
          reminder_morning_sent_at?: string | null;
          created_at?: string;
          cancelled_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["interview_bookings"]["Insert"]>;
        Relationships: [];
      };
      interview_sessions: {
        Row: {
          id: string;
          booking_id: string | null;
          applicant_id: string | null;
          behavioral_keys: string[];
          research_key: string | null;
          case_key: string | null;
          timers: Json;
          notes: Json;
          notes_updated_by: string | null;
          notes_updated_at: string | null;
          scores: Json;
          recommendation: string | null;
          scored_at: string | null;
          scored_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id?: string | null;
          applicant_id?: string | null;
          behavioral_keys?: string[];
          research_key?: string | null;
          case_key?: string | null;
          timers?: Json;
          notes?: Json;
          notes_updated_by?: string | null;
          notes_updated_at?: string | null;
          scores?: Json;
          recommendation?: string | null;
          scored_at?: string | null;
          scored_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["interview_sessions"]["Insert"]>;
        Relationships: [];
      };
      interview_session_scores: {
        Row: {
          id: string;
          session_id: string;
          reviewer_id: string;
          scores: Json;
          recommendation: string | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          reviewer_id: string;
          scores?: Json;
          recommendation?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["interview_session_scores"]["Insert"]>;
        Relationships: [];
      };
      client_meeting_availability: {
        Row: { id: string; exec_id: string; date: string; start_time: string; end_time: string; created_at: string };
        Insert: { id?: string; exec_id: string; date: string; start_time: string; end_time: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["client_meeting_availability"]["Insert"]>;
        Relationships: [];
      };
      client_meeting_slots: {
        Row: {
          id: string;
          date: string;
          start_time: string;
          end_time: string;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          start_time: string;
          end_time: string;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_meeting_slots"]["Insert"]>;
        Relationships: [];
      };
      client_meetings: {
        Row: {
          id: string;
          slot_id: string;
          contact_name: string;
          business_name: string;
          email: string;
          phone: string | null;
          needs: string;
          panel_exec_ids: string[];
          meeting_url: string | null;
          status: string;
          manage_token: string;
          reminder_day_before_sent_at: string | null;
          reminder_morning_sent_at: string | null;
          created_at: string;
          cancelled_at: string | null;
        };
        Insert: {
          id?: string;
          slot_id: string;
          contact_name: string;
          business_name: string;
          email: string;
          phone?: string | null;
          needs: string;
          panel_exec_ids: string[];
          meeting_url?: string | null;
          status?: string;
          manage_token: string;
          reminder_day_before_sent_at?: string | null;
          reminder_morning_sent_at?: string | null;
          created_at?: string;
          cancelled_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["client_meetings"]["Insert"]>;
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
      remove_member_work: {
        Args: { p_project_id: string; p_user_id: string };
        Returns: undefined;
      };
      assign_task_exec_reviewers: {
        Args: { p_task_id: string };
        Returns: Database["public"]["Tables"]["task_exec_reviews"]["Row"][];
      };
      apply_team_plan: {
        Args: { p_plan_id: string };
        Returns: unknown;
      };
      apply_interview_timer: {
        Args: { p_session: string; p_op: string; p_id: string; p_ids: string[] };
        Returns: Json;
      };
      merge_interview_scores: {
        Args: { p_set: Json; p_clear: string[]; p_session: string };
        Returns: undefined;
      };
      merge_interview_notes: {
        Args: { p_session: string; p_patch: Json };
        Returns: undefined;
      };
      member_has_history: {
        Args: { target: string };
        Returns: boolean;
      };
      merge_recruit_applicants: {
        Args: { p_survivor: string; p_absorbed: string; p_absorbed_alias?: string | null; p_keep_email?: string | null };
        Returns: string;
      };
      undo_merge_recruit_applicants: {
        Args: { p_log_id: string };
        Returns: unknown;
      };
      commit_application_import: {
        Args: { p_quarter: string; p_rows: unknown };
        Returns: unknown;
      };
      undo_application_import: {
        Args: { p_batch: string };
        Returns: number;
      };
      consume_chat_message: {
        Args: { p_user_cap: number; p_global_cap: number };
        Returns: "ok" | "user_cap" | "global_cap" | "unauthenticated";
      };
      refund_chat_message: { Args: { p_user: string }; Returns: undefined };
      record_chat_tokens: { Args: { p_user: string; p_in: number; p_out: number }; Returns: undefined };
      assistant_is_enabled: { Args: Record<string, never>; Returns: boolean };
      get_chat_usage_today: {
        Args: Record<string, never>;
        Returns: { user_messages: number; global_messages: number }[];
      };
      commit_recruit_import: {
        Args: { p_quarter: string; p_event: string | null; p_category: string; p_points: number; p_rows: unknown };
        Returns: unknown;
      };
      undo_recruit_import: {
        Args: { p_batch: string };
        Returns: number;
      };
      mark_recruit_booking: {
        Args: {
          p_kind: string;
          p_booking: string;
          p_applicant: string;
          p_status: string;
          p_category: string | null;
          p_points: number | null;
          p_reason: string | null;
        };
        Returns: string;
      };
      clear_recruit_booking_mark: {
        Args: { p_kind: string; p_booking: string };
        Returns: unknown;
      };
    };
  };
}
