# The images e2e/.elmo/elmo.yaml would build, under the names the compose files
# give them. CI builds from this instead of `docker compose build` so the build
# can start before `elmo init` has generated that compose file.

group "default" {
  targets = ["web", "migrate", "worker"]
}

target "_elmo" {
  context    = "."
  dockerfile = "docker/Dockerfile"
}

target "web" {
  inherits = ["_elmo"]
  target   = "web"
  tags     = ["elmo-e2e-web"]
}

target "migrate" {
  inherits = ["_elmo"]
  target   = "migrate"
  tags     = ["elmo-e2e-migrate"]
}

target "worker" {
  inherits = ["_elmo"]
  target   = "worker"
  tags     = ["elmo-e2e-worker"]
}
