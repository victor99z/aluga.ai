// Interfaces for paginated PocketBase list responses
export interface PocketBaseListItem {
  collectionId: string;
  collectionName: string;
  id: string;
  name?: string;
  url?: string;
  active?: boolean;
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

export interface PocketBaseListResponse<T = PocketBaseListItem> {
  page: number;
  perPage: number;
  totalPages: number;
  totalItems: number;
  items: T[];
}

// Interface for collection metadata objects (example provided by user)
export interface PocketBaseCollectionInfo {
  active: boolean;
  collectionId: string;
  collectionName: string;
  created: string; // ISO timestamp string
  id: string;
  name: string;
  updated: string; // ISO timestamp string
  url?: string;
  [key: string]: unknown;
}
