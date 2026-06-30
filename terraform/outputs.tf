output "project_id" {
  value = var.project_id
}

output "firestore_database_id" {
  value = google_firestore_database.fofodo.name
}

output "hosting_site_id" {
  value = google_firebase_hosting_site.fofodo.site_id
}

output "hosting_url" {
  value = "https://${google_firebase_hosting_site.fofodo.site_id}.web.app"
}

output "web_app_id" {
  value = google_firebase_web_app.fofodo.app_id
}

output "uploads_bucket" {
  value = google_storage_bucket.fofodo_uploads.name
}

# Client Firebase config (safe to ship in the bundle — these are public identifiers).
output "web_app_config" {
  value = {
    apiKey            = data.google_firebase_web_app_config.fofodo.api_key
    authDomain        = data.google_firebase_web_app_config.fofodo.auth_domain
    projectId         = var.project_id
    storageBucket     = lookup(data.google_firebase_web_app_config.fofodo, "storage_bucket", null)
    messagingSenderId = lookup(data.google_firebase_web_app_config.fofodo, "messaging_sender_id", null)
    appId             = google_firebase_web_app.fofodo.app_id
    measurementId     = lookup(data.google_firebase_web_app_config.fofodo, "measurement_id", null)
    databaseId        = var.firestore_database_id
  }
  sensitive = false
}
