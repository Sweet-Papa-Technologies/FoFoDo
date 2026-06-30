###############################################################################
# FoFoDo — infrastructure (data-plane) for the FoFoApps GCP project.
#
# IMPORTANT: FoFoApps (fofoapps-934be) is a SHARED Firebase project hosting
# many apps on a single (default) Firestore database. To avoid any blast
# radius on sibling apps, FoFoDo is fully isolated:
#   * its own NAMED Firestore database ("fofodo") with its own Security Rules
#   * its own Hosting site ("fofodo")
#   * its own Web app registration
#
# Terraform owns the long-lived data-plane (DB, hosting site, web app, APIs).
# The Firebase CLI owns code/config deploys (rules, indexes, functions, hosting
# content) and auto-manages the Cloud Scheduler job for the scheduled function.
###############################################################################

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# --- APIs ------------------------------------------------------------------
# Declared for self-host reproducibility (REQ-OSS-02). Already enabled on
# FoFoApps; disable_on_destroy=false so a destroy never tears down shared APIs.
resource "google_project_service" "apis" {
  for_each = toset([
    "firebase.googleapis.com",
    "firestore.googleapis.com",
    "firebaserules.googleapis.com",
    "firebasehosting.googleapis.com",
    "cloudfunctions.googleapis.com",
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudscheduler.googleapis.com",
    "aiplatform.googleapis.com",
    "fcm.googleapis.com",
    "artifactregistry.googleapis.com",
    "eventarc.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# --- Isolated, named Firestore database ------------------------------------
# A dedicated database keeps FoFoDo's data AND its Security Rules separate from
# every other app on the shared (default) database (NFR-4 / REQ-FOS-01).
resource "google_firestore_database" "fofodo" {
  provider                    = google-beta
  project                     = var.project_id
  name                        = var.firestore_database_id
  location_id                 = var.firestore_location
  type                        = "FIRESTORE_NATIVE"
  concurrency_mode            = "OPTIMISTIC"
  app_engine_integration_mode = "DISABLED"
  deletion_policy             = "DELETE"

  depends_on = [google_project_service.apis]
}

# --- Dedicated Hosting site -> https://fofodo.web.app ----------------------
resource "google_firebase_hosting_site" "fofodo" {
  provider = google-beta
  project  = var.project_id
  site_id  = var.hosting_site_id

  depends_on = [google_project_service.apis]
}

# --- Dedicated Web app registration ----------------------------------------
resource "google_firebase_web_app" "fofodo" {
  provider        = google-beta
  project         = var.project_id
  display_name    = "FoFoDo"
  deletion_policy = "DELETE"

  depends_on = [google_project_service.apis]
}

# Surface the web app's client config so the build can consume it.
data "google_firebase_web_app_config" "fofodo" {
  provider   = google-beta
  project    = var.project_id
  web_app_id = google_firebase_web_app.fofodo.app_id
}
