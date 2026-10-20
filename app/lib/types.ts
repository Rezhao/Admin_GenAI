export interface Media {
  id: string; user_id: string; community_id: string | null; image_path: string; caption: string; prompt: string; created_at: string;
  image_url?: string; author?: string; email?: string; community?: string; upvotes?: number; downvotes?: number
}
export interface Profile {
  id: string; email: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null;
  is_superadmin: boolean; created_at: string | null; last_sign_in_at: string | null; provider: string; media_count: number; vote_count: number
}
export interface Rating { generation_id: string; user_id: string; vote: number; created_at: string; caption: string; voter: string; email: string | null; community: string | null }
export interface Community { id: string; name: string; visibility: 'public' | 'private' }
export interface PageResult<T> { items: T[]; total: number; page: number; page_size: number }
export interface Overview {
  profiles: number; media: number; votes: number; upvotes: number; downvotes: number; communities: number; new_media: number; new_profiles: number; unrated: number; unassigned: number;
  activity: { day: string; posts: number; votes: number }[];
  community_activity: { id: string; name: string; visibility: string; posts: number }[];
  top_posts: { id: string; caption: string; upvotes: number; downvotes: number; score: number; community: string }[]
}
