<?php
// Shared page footer: closes the layout containers and loads the scripts
?>
        </div> <!-- /.cb-content -->
    </div> <!-- /.cb-main -->
</div> <!-- /.cb-layout -->
<script src="<?= BASE_URL ?>js/bootstrap.bundle.min.js"></script>
<!-- The ?v= timestamp forces browsers to reload app.js after it is edited -->
<script src="<?= BASE_URL ?>js/app.js?v=<?= filemtime(ROOT_PATH . '/public/js/app.js') ?>"></script>
</body>
</html>
