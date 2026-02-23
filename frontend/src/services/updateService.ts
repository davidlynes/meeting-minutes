/**
 * Update Service
 *
 * Handles update checks via the backend release API (MongoDB-backed).
 * Replaces the Tauri updater plugin approach with a simple HTTP check
 * against our own backend, which serves release info from MongoDB.
 */

import { getVersion } from '@tauri-apps/api/app';

const BACKEND_URL = 'http://localhost:5167';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  version?: string;
  date?: string;
  body?: string;
  downloadUrl?: string;
  whatsNew?: string[];
}

/**
 * Update Service
 * Singleton service for managing app updates via backend API
 */
export class UpdateService {
  private updateCheckInProgress = false;
  private lastCheckTime: number | null = null;
  private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Check for available updates by querying our backend release API
   * @param force Force check even if recently checked
   * @returns Promise with update information
   */
  async checkForUpdates(force = false): Promise<UpdateInfo> {
    // Prevent concurrent update checks
    if (this.updateCheckInProgress) {
      throw new Error('Update check already in progress');
    }

    // Skip if checked recently (unless forced)
    if (!force && this.lastCheckTime) {
      const timeSinceLastCheck = Date.now() - this.lastCheckTime;
      if (timeSinceLastCheck < this.CHECK_INTERVAL_MS) {
        console.log('Skipping update check - checked recently');
        return {
          available: false,
          currentVersion: await getVersion(),
        };
      }
    }

    this.updateCheckInProgress = true;
    this.lastCheckTime = Date.now();

    try {
      const currentVersion = await getVersion();

      const response = await fetch(
        `${BACKEND_URL}/api/releases/latest?current_version=${encodeURIComponent(currentVersion)}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) {
        throw new Error(`Release API returned ${response.status}`);
      }

      const data = await response.json();

      if (data.available) {
        return {
          available: true,
          currentVersion,
          version: data.version,
          date: data.release_date,
          body: data.release_notes,
          downloadUrl: data.download_url,
          whatsNew: data.whats_new,
        };
      }

      return {
        available: false,
        currentVersion,
      };
    } catch (error) {
      console.error('Failed to check for updates:', error);
      throw error;
    } finally {
      this.updateCheckInProgress = false;
    }
  }

  /**
   * Get the current app version
   * @returns Promise with version string
   */
  async getCurrentVersion(): Promise<string> {
    return getVersion();
  }

  /**
   * Check if an update check was performed recently
   * @returns true if checked within the interval
   */
  wasCheckedRecently(): boolean {
    if (!this.lastCheckTime) return false;
    const timeSinceLastCheck = Date.now() - this.lastCheckTime;
    return timeSinceLastCheck < this.CHECK_INTERVAL_MS;
  }
}

// Export singleton instance
export const updateService = new UpdateService();
