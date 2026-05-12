$workspaceDir = Get-Location
$tempFile = "$env:TEMP\code_content.txt"
$progressInterval = 100

# Trouver les fichiers
Write-Host "Recherche des fichiers en cours..."
$files = Get-ChildItem -Path $workspaceDir -Recurse -Include "*.html", "*.css", "*.js" , "*.md" -File |
    Where-Object { $_.FullName -notmatch '\\vendor\\|\\node_modules\\|\\.git\\|\\storage\\|\\public\\|\\bootstrap\\|\\dist\\|\\build\\|\\__pycache__\\' }

# Vérifier les fichiers
$fileCount = $files.Count
if ($fileCount -eq 0) {
    Write-Host "Aucun fichier trouvé." -ForegroundColor Red
    Read-Host "Appuyez sur Entrée pour continuer"
    exit
}

Write-Host "Nombre de fichiers trouvés: $fileCount" -ForegroundColor Green

# Afficher la liste des fichiers trouvés
Write-Host "`nFichiers qui seront traités:" -ForegroundColor Cyan
$files | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }

# Demander confirmation
$confirmation = Read-Host "`nVoulez-vous continuer? (O/N)"
if ($confirmation -notmatch '^[OoYy]') {
    Write-Host "Opération annulée." -ForegroundColor Yellow
    exit
}

# Vider le fichier temporaire
try {
    "" | Out-File -FilePath $tempFile -Encoding UTF8
    Write-Host "`nFichier temporaire créé: $tempFile" -ForegroundColor Green
}
catch {
    Write-Host "Erreur lors de la création du fichier temporaire: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# Ajouter le contenu des fichiers avec gestion d'erreurs améliorée
$processedCount = 0
$errorCount = 0
$totalSize = 0

foreach ($file in $files) {
    try {
        # Ajouter l'en-tête du fichier
        $header = "// FICHIER: $($file.FullName)"
        $header | Add-Content -Path $tempFile -Encoding UTF8
        "// TAILLE: $([Math]::Round($file.Length / 1KB, 2)) KB" | Add-Content -Path $tempFile -Encoding UTF8
        "// MODIFIÉ: $($file.LastWriteTime)" | Add-Content -Path $tempFile -Encoding UTF8
        "" | Add-Content -Path $tempFile -Encoding UTF8

        # Ajouter le contenu du fichier
        $content = Get-Content -Path $file.FullName -ErrorAction Stop
        $content | Add-Content -Path $tempFile -Encoding UTF8

        # Ajouter un séparateur
        "`n" + "=" * 80 + "`n" | Add-Content -Path $tempFile -Encoding UTF8

        $totalSize += $file.Length
        $processedCount++

        if ($processedCount % $progressInterval -eq 0) {
            $percentComplete = [Math]::Round(($processedCount / $fileCount) * 100, 2)
            Write-Host "Traitement en cours: $processedCount sur $fileCount fichiers ($percentComplete%)" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Erreur lors du traitement de $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
        $errorCount++
    }
}

# Résumé final
Write-Host "`n" + "=" * 50 -ForegroundColor Green
Write-Host "TRAITEMENT TERMINÉ" -ForegroundColor Green
Write-Host "=" * 50 -ForegroundColor Green
Write-Host "Fichiers traités: $processedCount sur $fileCount" -ForegroundColor Green
Write-Host "Erreurs: $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Green" })
Write-Host "Taille totale: $([Math]::Round($totalSize / 1MB, 2)) MB" -ForegroundColor Green
Write-Host "Contenu sauvegardé dans: $tempFile" -ForegroundColor Green

# Options pour l'utilisateur
Write-Host "`nOptions disponibles:" -ForegroundColor Cyan
Write-Host "1. Copier dans le presse-papiers (si la taille le permet)" -ForegroundColor White
Write-Host "2. Ouvrir le fichier dans le bloc-notes" -ForegroundColor White
Write-Host "3. Afficher le chemin du fichier" -ForegroundColor White
Write-Host "4. Quitter" -ForegroundColor White

$choice = Read-Host "`nChoisissez une option (1-4)"

switch ($choice) {
    "1" {
        try {
            Write-Host "Copie dans le presse-papiers..." -ForegroundColor Yellow
            Get-Content -Path $tempFile | Set-Clipboard
            Write-Host "Contenu copié dans le presse-papiers avec succès!" -ForegroundColor Green
        }
        catch {
            Write-Host "Erreur lors de la copie (fichier probablement trop volumineux): $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Vous pouvez essayer manuellement: Get-Content -Path '$tempFile' | Set-Clipboard" -ForegroundColor Yellow
        }
    }
    "2" {
        Write-Host "Ouverture du fichier..." -ForegroundColor Yellow
        Start-Process notepad.exe -ArgumentList $tempFile
    }
    "3" {
        Write-Host "Chemin du fichier: $tempFile" -ForegroundColor Green
        Set-Clipboard -Value $tempFile
        Write-Host "Chemin copié dans le presse-papiers!" -ForegroundColor Green
    }
    "4" {
        Write-Host "Au revoir!" -ForegroundColor Green
    }
    default {
        Write-Host "Choix invalide. Chemin du fichier: $tempFile" -ForegroundColor Yellow
    }
}

Write-Host "`nScript terminé. Appuyez sur Entrée pour fermer..." -ForegroundColor Gray
Read-Host
