$base = 'https://huda044-lucivoid.hf.space'
$paths = @('/health', '/api/security-status', '/api/youtube-cookies-status', '/api/billing/gateway')
foreach ($p in $paths) {
  try {
    $r = Invoke-WebRequest -Uri ($base + $p) -UseBasicParsing -TimeoutSec 25
    $body = if ($r.Content.Length -gt 200) { $r.Content.Substring(0, 200) + '…' } else { $r.Content }
    Write-Output ("{0,-32} {1}  {2}" -f $p, $r.StatusCode, $body)
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    Write-Output ("{0,-32} ERR={1}  {2}" -f $p, $code, $_.Exception.Message)
  }
}
