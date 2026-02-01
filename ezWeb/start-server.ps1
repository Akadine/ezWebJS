
# Start-Server.ps1

# Configuration
$ServerBase = "$PSScriptRoot"  # Change this to your desired server root folder
$Port = 8080  # Change port if needed

# Ensure the server folder exists
if (!(Test-Path $ServerBase)) {
    Write-Host "Error: Server base folder '$ServerBase' does not exist."
    exit 1
}

# Start the PowerShell HTTP server
Write-Host "Starting HTTP server in '$ServerBase' on port $Port..."
$HttpListener = New-Object System.Net.HttpListener
$HttpListener.Prefixes.Add("http://localhost:$Port/")
$HttpListener.Start()

# MIME type mapping
$MimeTypes = @{
    ".html" = "text/html"
    ".htm"  = "text/html"
    ".css"  = "text/css"
    ".js"   = "application/javascript"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
    ".otf"  = "font/otf"
    ".eot"  = "application/vnd.ms-fontobject"
    ".xml"  = "application/xml"
}

# Function to handle requests (runs in the main process)
$ServerRunning = $true
function Start-Server {
    while ($ServerRunning -and $HttpListener.IsListening) {
        try {
            # Handle incoming requests
            if ($HttpListener.IsListening) {
                $Context = $HttpListener.GetContext()
                $Request = $Context.Request
                $Response = $Context.Response
                $FilePath = Join-Path -Path $ServerBase -ChildPath $Request.Url.LocalPath.TrimStart("/")

                # Default to index.html for root URL
                if ($Request.Url.LocalPath -eq "/") {
                    $FilePath = Join-Path $ServerBase "index.html"
                }

                if (Test-Path $FilePath -PathType Leaf) {
                    $Extension = [System.IO.Path]::GetExtension($FilePath)
                    $ContentType = if ($MimeTypes.ContainsKey($Extension)) { $MimeTypes[$Extension] } else { "application/octet-stream" }

                    $Content = [System.IO.File]::ReadAllBytes($FilePath)
                    $Response.ContentType = $ContentType
                    $Response.OutputStream.Write($Content, 0, $Content.Length)
                } else {
                    $Response.StatusCode = 404
                    $Response.StatusDescription = "Not Found"
                }
                $Response.Close()
            }
        } catch {
            Write-Host "Error handling request: $_"
        }
    }
}

# Start Chrome in a new window. Change to your prefered broswer. 
#You may still navigate to http://localhost:8080/index.html in another browser while the console window is open 
$Url = "http://localhost:$Port/index.html"
Write-Host "Launching Chrome with $Url..."
Write-Host "You may navigate to http://localhost:8080/index.html in any browser while this console window is open." 
Write-Host "Close this console window to stop the server."
Start-Process "chrome.exe" -ArgumentList "--new-window $Url"

# Start the server
Start-Server

#closing the console window closes the server