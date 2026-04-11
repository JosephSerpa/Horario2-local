$source = @"
using System;
using System.Diagnostics;
using System.Windows.Forms;
using System.Drawing;
using System.Text.RegularExpressions;

namespace ServerLauncher {
    public class MainForm : Form {
        private Button toggleButton;
        private Button buildButton;
        private Label statusLabel;
        private Label linkLabel;
        private Process serverProcess;
        private TextBox logBox;
        private Panel headerPanel;
        private Label headerTitle;

        public MainForm() {
            this.Text = "Lanzador de App";
            this.Size = new Size(460, 460);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.White;

            headerPanel = new Panel();
            headerPanel.BackColor = Color.FromArgb(41, 128, 185);
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 60;

            headerTitle = new Label();
            headerTitle.Text = "Control de Servidor";
            headerTitle.Font = new Font("Segoe UI", 16, FontStyle.Bold);
            headerTitle.ForeColor = Color.White;
            headerTitle.AutoSize = true;
            headerTitle.Location = new Point(20, 12);

            headerPanel.Controls.Add(headerTitle);

            statusLabel = new Label();
            statusLabel.Text = "Estado: Detenido";
            statusLabel.Location = new Point(20, 80);
            statusLabel.AutoSize = true;
            statusLabel.Font = new Font("Segoe UI", 12, FontStyle.Bold);
            statusLabel.ForeColor = Color.FromArgb(50, 50, 50);

            linkLabel = new Label();
            linkLabel.Text = "Esperando iniciar...";
            linkLabel.Location = new Point(20, 112);
            linkLabel.AutoSize = true;
            linkLabel.Font = new Font("Segoe UI", 11, FontStyle.Underline);
            linkLabel.ForeColor = Color.Gray;
            linkLabel.Cursor = Cursors.Hand;
            linkLabel.Click += (s, e) => {
                if (linkLabel.Text.StartsWith("http")) {
                    Process.Start(new ProcessStartInfo(linkLabel.Text) { UseShellExecute = true });
                }
            };

            toggleButton = new Button();
            toggleButton.Text = "INICIAR SERVIDOR";
            toggleButton.Location = new Point(20, 150);
            toggleButton.Size = new Size(400, 50);
            toggleButton.Font = new Font("Segoe UI", 12, FontStyle.Bold);
            toggleButton.BackColor = Color.FromArgb(46, 204, 113);
            toggleButton.ForeColor = Color.White;
            toggleButton.FlatStyle = FlatStyle.Flat;
            toggleButton.FlatAppearance.BorderSize = 0;
            toggleButton.Cursor = Cursors.Hand;
            toggleButton.Click += ToggleButton_Click;

            buildButton = new Button();
            buildButton.Text = "RECONSTRUIR INTERFAZ (SOLO SI HAY CAMBIOS)";
            buildButton.Location = new Point(20, 210);
            buildButton.Size = new Size(400, 40);
            buildButton.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            buildButton.BackColor = Color.FromArgb(236, 240, 241);
            buildButton.ForeColor = Color.FromArgb(50, 50, 50);
            buildButton.FlatStyle = FlatStyle.Flat;
            buildButton.FlatAppearance.BorderSize = 1;
            buildButton.FlatAppearance.BorderColor = Color.LightGray;
            buildButton.Cursor = Cursors.Hand;
            buildButton.Click += BuildButton_Click;

            logBox = new TextBox();
            logBox.Location = new Point(20, 265);
            logBox.Size = new Size(400, 130);
            logBox.Multiline = true;
            logBox.ReadOnly = true;
            logBox.ScrollBars = ScrollBars.Vertical;
            logBox.Font = new Font("Consolas", 9);
            logBox.BackColor = Color.FromArgb(245, 245, 245);
            logBox.ForeColor = Color.FromArgb(50, 50, 50);
            logBox.BorderStyle = BorderStyle.FixedSingle;

            this.Controls.Add(headerPanel);
            this.Controls.Add(statusLabel);
            this.Controls.Add(linkLabel);
            this.Controls.Add(toggleButton);
            this.Controls.Add(buildButton);
            this.Controls.Add(logBox);

            this.FormClosing += (s, e) => { StopServer(); };
        }

        private void ToggleButton_Click(object sender, EventArgs e) {
            if (serverProcess == null || serverProcess.HasExited) {
                StartServer();
            } else {
                StopServer();
            }
        }

        private void BuildButton_Click(object sender, EventArgs e) {
            if (serverProcess != null && !serverProcess.HasExited) {
                MessageBox.Show("Por favor deten el servidor antes de reconstruir.", "Aviso", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try {
                logBox.Clear();
                AppendLog("Iniciando la reconstruccion (npm run build)...");
                AppendLog("Por favor espera...");
                buildButton.Enabled = false;
                toggleButton.Enabled = false;

                Process buildProcess = new Process();
                buildProcess.StartInfo.FileName = "cmd.exe";
                buildProcess.StartInfo.Arguments = "/c npm run build";
                buildProcess.StartInfo.UseShellExecute = false;
                buildProcess.StartInfo.RedirectStandardOutput = true;
                buildProcess.StartInfo.RedirectStandardError = true;
                buildProcess.StartInfo.CreateNoWindow = true;

                buildProcess.OutputDataReceived += (s, args) => {
                    if (args.Data != null) AppendLog(args.Data);
                };
                buildProcess.ErrorDataReceived += (s, args) => {
                    if (args.Data != null) AppendLog("ERROR: " + args.Data);
                };

                buildProcess.Exited += (s, args) => {
                    AppendLog("");
                    AppendLog("[COMPLETADO] Reconstruccion finalizada.");
                    if (this.IsHandleCreated) {
                        this.Invoke((MethodInvoker)delegate {
                            buildButton.Enabled = true;
                            toggleButton.Enabled = true;
                        });
                    }
                };
                buildProcess.EnableRaisingEvents = true;

                buildProcess.Start();
                buildProcess.BeginOutputReadLine();
                buildProcess.BeginErrorReadLine();
            } catch (Exception ex) {
                MessageBox.Show("Error al compilar: " + ex.Message);
                buildButton.Enabled = true;
                toggleButton.Enabled = true;
            }
        }

        private void StartServer() {
            try {
                serverProcess = new Process();
                serverProcess.StartInfo.FileName = "cmd.exe";
                serverProcess.StartInfo.Arguments = "/c set NODE_ENV=production && npx tsx server.ts";
                serverProcess.StartInfo.UseShellExecute = false;
                serverProcess.StartInfo.RedirectStandardOutput = true;
                serverProcess.StartInfo.RedirectStandardError = true;
                serverProcess.StartInfo.CreateNoWindow = true;

                serverProcess.OutputDataReceived += (s, args) => {
                    if (args.Data != null) {
                        AppendLog(args.Data);
                        if (args.Data.Contains("http://")) {
                            var match = Regex.Match(args.Data, @"http://[^\s]+");
                            if (match.Success) {
                                UpdateLink(match.Value);
                            }
                        }
                    }
                };
                
                serverProcess.ErrorDataReceived += (s, args) => {
                    if (args.Data != null) AppendLog("ERROR: " + args.Data);
                };

                serverProcess.Start();
                serverProcess.BeginOutputReadLine();
                serverProcess.BeginErrorReadLine();

                statusLabel.Text = "Estado: Corriendo";
                statusLabel.ForeColor = Color.FromArgb(39, 174, 96);
                
                toggleButton.Text = "DETENER SERVIDOR";
                toggleButton.BackColor = Color.FromArgb(231, 76, 60);
                buildButton.Enabled = false;
                
                logBox.Clear();
                AppendLog("Levantando el servidor...");
            } catch (Exception ex) {
                MessageBox.Show("Error: " + ex.Message);
            }
        }

        private void UpdateLink(string url) {
            if (this.InvokeRequired) {
                this.Invoke(new Action<string>(UpdateLink), url);
                return;
            }
            linkLabel.Text = url;
            linkLabel.ForeColor = Color.FromArgb(41, 128, 185);
            AppendLog("");
            AppendLog("EXCELENTE! Servidor listo.");
            AppendLog("Haz clic en el enlace azul de arriba.");
        }

        private void AppendLog(string text) {
            if (this.InvokeRequired) {
                this.Invoke(new Action<string>(AppendLog), text);
                return;
            }
            logBox.AppendText(text + Environment.NewLine);
            logBox.SelectionStart = logBox.Text.Length;
            logBox.ScrollToCaret();
        }

        private void StopServer() {
            if (serverProcess != null && !serverProcess.HasExited) {
                AppendLog("");
                AppendLog("Apagando el servidor...");
                try {
                    var p = Process.Start(new ProcessStartInfo("cmd.exe", "/c taskkill /PID " + serverProcess.Id + " /T /F") { CreateNoWindow = true, UseShellExecute = false });
                    if (p != null) p.WaitForExit();
                } catch { }
                serverProcess = null;
            }
            if (this.IsHandleCreated) {
                this.Invoke((MethodInvoker)delegate {
                    statusLabel.Text = "Estado: Detenido";
                    statusLabel.ForeColor = Color.FromArgb(50, 50, 50);
                    
                    toggleButton.Text = "INICIAR SERVIDOR";
                    toggleButton.BackColor = Color.FromArgb(46, 204, 113);
                    
                    buildButton.Enabled = true;
                    
                    linkLabel.Text = "Esperando inicio...";
                    linkLabel.ForeColor = Color.Gray;
                });
            }
        }

        [STAThread]
        public static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
"@

# Compilar el código usando ASCII plano!
Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly "LanzadorHorario.exe" -OutputType WindowsApplication -ReferencedAssemblies "System.Windows.Forms", "System.Drawing"
Write-Host "Ejecutable 'LanzadorHorario.exe' compilado exitosamente sin acentos."
