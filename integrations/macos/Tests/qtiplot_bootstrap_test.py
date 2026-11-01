import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

class BootstrapTest(unittest.TestCase):
    def test_embedded_interpreter_without_file_reports_failure(self):
        source = (Path(__file__).resolve().parents[1] / 'Resources/qtiplot_bridge.py').read_text()
        with tempfile.TemporaryDirectory() as folder:
            # QtiPlot executes scripts without __file__. Even a missing input must
            # return a structured error instead of leaving the native app waiting.
            qt = types.ModuleType('PyQt5'); qt.QtCore = object(); qt.QtGui = object()
            with patch.dict(os.environ, {'NISML_QTI_WORKDIR': folder}), patch.dict(sys.modules, {'qti': types.ModuleType('qti'), 'PyQt5': qt}):
                exec(compile(source, '<QtiPlot>', 'exec'), {'__name__': '__main__'})
            result = json.loads((Path(folder) / 'result.json').read_text())
            self.assertFalse(result['ok'])
            self.assertIn('input.json', result['error'])

if __name__ == '__main__': unittest.main()
