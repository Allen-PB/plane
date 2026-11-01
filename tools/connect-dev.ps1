# Connect to the remote Plane dev site. Keep this terminal open while using it.
# Dev site: http://localhost:3000 (also available on port 8080)
# Mail preview: http://localhost:8025
ssh -i "$env:USERPROFILE\.ssh\id_rsa" -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -L 3000:127.0.0.1:8080 -L 8080:127.0.0.1:8080 -L 8025:127.0.0.1:8025 root@152.42.166.16
