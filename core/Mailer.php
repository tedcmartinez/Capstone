<?php
// Mailer helper
// Wraps PHPMailer using the Gmail SMTP settings from config/email.config.php

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

class Mailer
{
    // Sends one HTML email. Returns true on success, false on failure.
    // Failures are caught here, not thrown, so the caller can log a
    // 'failed' row in notification_log instead of crashing the request.
    public static function send(string $toEmail, string $subject, string $bodyHtml): bool
    {
        $config = require ROOT_PATH . '/config/email.config.php';

        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host = $config['host'];
            $mail->SMTPAuth = true;
            $mail->Username = $config['username'];
            $mail->Password = $config['password'];
            $mail->SMTPSecure = $config['encryption'];
            $mail->Port = $config['port'];

            $mail->setFrom($config['from_email'], $config['from_name']);
            $mail->addAddress($toEmail);

            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $bodyHtml;

            $mail->send();
            return true;
        } catch (PHPMailerException $e) {
            return false;
        }
    }
}
