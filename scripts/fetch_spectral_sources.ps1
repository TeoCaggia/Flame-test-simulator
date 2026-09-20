param([switch]$Force)
$ErrorActionPreference = 'Stop'
$dest = Join-Path $PSScriptRoot '../files/spectral_sources'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$elements = (Get-Content (Join-Path $PSScriptRoot '../files/elements.json') -Raw | ConvertFrom-Json).elements
$urls = [ordered]@{}
foreach ($element in $elements) {
    $symbol = $element.symbol
    $url = "https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=$symbol%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on"
    $cache = Join-Path $dest "$($symbol)_I.tsv"
    if ($Force -or !(Test-Path $cache)) {
        $response = (Invoke-WebRequest -Uri $url).Content
        if ($response -notmatch 'obs_wl_air') { throw "Unexpected NIST response: $symbol" }
        [System.IO.File]::WriteAllText($cache, $response)
    }
    $urls[$symbol] = $url
    Write-Output "$symbol downloaded"
}
$metadata = @{retrieved='2026-09-20';nist=$urls} | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $dest 'queries.json'), $metadata)
