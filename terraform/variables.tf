variable "project_id" {
  description = "GCP / Firebase project ID."
  type        = string
  default     = "fofoapps-934be"
}

variable "region" {
  description = "Default region for regional resources (Cloud Functions, Vertex AI)."
  type        = string
  default     = "us-central1"
}

variable "firestore_database_id" {
  description = "Named Firestore database for FoFoDo (isolated from the shared default DB)."
  type        = string
  default     = "fofodo"
}

variable "firestore_location" {
  description = "Firestore location. nam5 = US multi-region (matches the project's default DB)."
  type        = string
  default     = "nam5"
}

variable "hosting_site_id" {
  description = "Firebase Hosting site id -> https://<site_id>.web.app"
  type        = string
  default     = "fofodo"
}
