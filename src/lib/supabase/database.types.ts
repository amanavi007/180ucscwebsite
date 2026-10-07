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
      apply_team_plan: {
        Args: { p_plan_id: string };
        Returns: unknown;
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
