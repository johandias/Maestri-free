param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
python "$scriptDir\..\core\maestri_cli.py" @Arguments
