// Populate globalThis.Icons (name → codepoint) for icon rendering.
import '../../resources/fonts/material_icons.js';

import React, { useState } from 'react';
import {
  ActivityIndicator,
  AppBar,
  Badge,
  Banner,
  BottomAppBar,
  BottomSheet,
  Button,
  ButtonGroup,
  Card,
  Carousel,
  Checkbox,
  Chip,
  DatePicker,
  Dialog,
  Divider,
  ExtendedFab,
  Fab,
  Icon,
  IconButton,
  LoadingIndicator,
  MaterialList,
  Menu,
  MenuItem,
  NavigationBar,
  NavigationBarItem,
  NavigationRail,
  ProgressIndicator,
  RadioButton,
  RangeSlider,
  ScrollView,
  Search,
  SearchBar,
  SegmentedButton,
  Slider,
  Snackbar,
  SplitButton,
  Switch,
  Tabs,
  Text,
  TextField,
  TextInput,
  TimePicker,
  Tooltip,
  View,
  render,
} from '@rayact/react';

function MaterialGallery() {
  const [enabled, setEnabled] = useState(true);
  const [slider, setSlider] = useState(0.45);
  const [rangeStart, setRangeStart] = useState(0.22);
  const [rangeEnd, setRangeEnd] = useState(0.78);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [tab, setTab] = useState(false);
  const [count, setCount] = useState(3);
  const [chipSelected, setChipSelected] = useState(true);
  const [message, setMessage] = useState('Tap any component');
  const [textValue, setTextValue] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [surfaceSelected, setSurfaceSelected] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState('2026-06-07');
  const [selectedTime, setSelectedTime] = useState('14:30');

  const bumpRange = () => {
    const nextStart = rangeStart >= 0.45 ? 0.12 : rangeStart + 0.08;
    setRangeStart(nextStart);
    setRangeEnd(Math.min(0.92, nextStart + 0.48));
    setMessage('RangeSlider changed');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 0xfffbfeff }}>
      <View style={{ padding: 16, gap: 16, flexShrink: 0, minHeight: 2000 }}>
      <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: 'bold' }}>
        raym3 Material Gallery
      </Text>

      <Card style={{ gap: 12, flexShrink: 0 }}>
        <Text>Controls</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Checkbox checked={enabled} onPress={() => { setEnabled(!enabled); setMessage('Checkbox toggled'); }} />
          <RadioButton checked={enabled} onPress={() => { setEnabled(true); setMessage('Radio selected'); }} />
          <Switch checked={enabled} onPress={() => { setEnabled(!enabled); setMessage('Switch toggled'); }} />
        </View>
        <Slider value={slider} min={0} max={1} onValueChange={setSlider} />
        <RangeSlider startProgress={rangeStart} endProgress={rangeEnd} onPress={bumpRange} />
      </Card>

      <Card style={{ gap: 12, flexShrink: 0 }}>
        <Text>Buttons and Inputs</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button label={`Filled ${count}`} onPress={() => { setCount(count + 1); setMessage('Filled button pressed'); }} />
          <Button label="Tonal" onPress={() => { setEnabled(!enabled); setMessage('Tonal button pressed'); }} />
          <IconButton onPress={() => { setSurfaceSelected(!surfaceSelected); setMessage('IconButton pressed'); }}>
            <Icon name="settings" size={24} />
          </IconButton>
          <Fab onPress={() => { setCount(count + 1); setMessage('FAB pressed'); }}>
            <Icon name="add" size={24} />
          </Fab>
        </View>
        <ExtendedFab label={enabled ? 'Compose' : 'Composed'} onPress={() => { setEnabled(!enabled); setMessage('Extended FAB pressed'); }}>
          <Icon name="edit" size={24} />
        </ExtendedFab>
        <TextInput value={textValue} placeholder="Text field" onChangeText={(value) => { setTextValue(value); setMessage('TextInput changed'); }} />
        <TextField
          value={textValue}
          variant="filled"
          label="Filled text field"
          onChangeText={(value) => { setTextValue(value); setMessage('Filled changed'); }}
          onFocus={() => setMessage('Filled focused')}
        />
        <TextField
          value={textValue}
          variant="outlined"
          label="Outlined text field"
          onChangeText={(value) => { setTextValue(value); setMessage('Outlined changed'); }}
          onFocus={() => setMessage('Outlined focused')}
        />
        <TextField
          value={textValue}
          variant="underline"
          label="Underline text field"
          onChangeText={(value) => { setTextValue(value); setMessage('Underline changed'); }}
          onFocus={() => setMessage('Underline focused')}
        />
        <SearchBar value={searchValue} placeholder="Search" onChangeText={(value) => { setSearchValue(value); setMessage('SearchBar changed'); }} />
        <Search selected={surfaceSelected} onPress={() => { setSurfaceSelected(!surfaceSelected); setMessage('Search surface pressed'); }} />
      </Card>

      <Card style={{ gap: 12, flexShrink: 0 }}>
        <Text>Feedback and Navigation</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Badge value={count} onPress={() => { setCount(count + 1); setMessage('Badge pressed'); }} />
          <Badge onPress={() => { setCount(0); setMessage('Dot badge pressed'); }} />
          <Chip label={enabled ? 'Enabled' : 'Disabled'} selected={enabled} onPress={() => { setEnabled(!enabled); setMessage('Chip toggled'); }} />
          <Chip label="Selected" selected={chipSelected} onPress={() => { setChipSelected(!chipSelected); setMessage('Selected chip toggled'); }} />
          <ActivityIndicator onPress={() => { setEnabled(!enabled); setMessage('ActivityIndicator pressed'); }} />
        </View>
        <ProgressIndicator progress={slider} />
        <Divider onPress={() => { setSlider(slider > 0.8 ? 0.15 : slider + 0.15); setMessage('Divider pressed'); }} />
        <SegmentedButton>
          <SegmentedButton
            label="Day"
            selected={period === 'day'}
            onPress={() => setPeriod('day')}
          />
          <SegmentedButton
            label="Week"
            selected={period === 'week'}
            onPress={() => setPeriod('week')}
          />
          <SegmentedButton
            label="Month"
            selected={period === 'month'}
            onPress={() => setPeriod('month')}
          />
        </SegmentedButton>
        <Tabs>
          <Tabs
            label="For you"
            selected={!tab}
            onPress={() => setTab(false)}
          />
          <Tabs
            label="Following"
            selected={tab}
            onPress={() => setTab(true)}
          />
        </Tabs>
        <NavigationBar>
          <NavigationBarItem label="Home" selected={!tab}>
            <Icon name="home" size={24} filled={!tab} />
          </NavigationBarItem>
          <NavigationBarItem label="Search" selected={tab}>
            <Icon name="search" size={24} filled={tab} />
          </NavigationBarItem>
        </NavigationBar>
        <Snackbar label={message} onPress={() => setMessage('Snackbar pressed')} />
      </Card>

      <Card style={{ gap: 12, flexShrink: 0 }}>
        <Text>Button groups</Text>
        <ButtonGroup>
          <ButtonGroup label="Day" selected={period === 'day'} onPress={() => { setPeriod('day'); setMessage('ButtonGroup Day'); }} />
          <ButtonGroup label="Week" selected={period === 'week'} onPress={() => { setPeriod('week'); setMessage('ButtonGroup Week'); }} />
          <ButtonGroup label="Month" selected={period === 'month'} onPress={() => { setPeriod('month'); setMessage('ButtonGroup Month'); }} />
        </ButtonGroup>
        <SplitButton label={enabled ? 'Save' : 'Saved'} onPress={() => { setEnabled(!enabled); setMessage('SplitButton pressed'); }} />
      </Card>

      <Card style={{ gap: 12, flexShrink: 0 }}>
        <Text>More components</Text>
        <Banner onPress={() => { setCount(count + 1); setMessage('Banner pressed'); }}>
          <Text>Update available. Restart count {count}</Text>
        </Banner>
        <MaterialList style={{ gap: 4 }} selected={surfaceSelected} onPress={() => { setSurfaceSelected(!surfaceSelected); setMessage('MaterialList pressed'); }}>
          <Text>Material list container</Text>
          <Text>Density-correct list content</Text>
        </MaterialList>
        <Button label={`Time Picker (${selectedTime})`} onPress={() => { setShowTimePicker(true); setMessage('Opening TimePicker'); }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LoadingIndicator onPress={() => { setEnabled(!enabled); setMessage('LoadingIndicator pressed'); }} />
          <ProgressIndicator progress={enabled ? -1 : slider} onPress={() => { setEnabled(!enabled); setMessage('ProgressIndicator pressed'); }} />
        </View>
        <Menu>
          <MenuItem label="Preview" onPress={() => setMessage('Preview pressed')}>
            <Icon name="visibility" size={20} />
          </MenuItem>
          <MenuItem label="Duplicate" onPress={() => setMessage('Duplicate pressed')}>
            <Icon name="content_copy" size={20} />
          </MenuItem>
          <MenuItem label="Edit" selected={chipSelected} onPress={() => { setChipSelected(!chipSelected); setMessage('Edit pressed'); }}>
            <Icon name="edit" size={20} filled={chipSelected} />
          </MenuItem>
          <MenuItem label="Delete" onPress={() => setMessage('Delete pressed')}>
            <Icon name="delete" size={20} />
          </MenuItem>
        </Menu>
        <Tooltip>
          <View style={{ padding: 12, backgroundColor: 0xffe0e0ff }}>
            <Text>Tooltip content</Text>
          </View>
        </Tooltip>
        <Button label="Show Dialog" onPress={() => { setShowDialog(true); setMessage('Dialog opened'); }} />
        <Button label="Show BottomSheet" onPress={() => { setShowBottomSheet(true); setMessage('BottomSheet opened'); }} />
        <Button label={`Date Picker (${selectedDate})`} onPress={() => { setShowDatePicker(true); setMessage('Opening DatePicker'); }} />
        <DatePicker
          variant="docked"
          value={selectedDate}
          label="Docked Date Picker"
          onChange={(d) => { setSelectedDate(d); setMessage(`Docked Date changed to ${d}`); }}
        />
        <NavigationRail>
          <NavigationBarItem label="Home" selected={!tab}>
            <Icon name="home" size={24} filled={!tab} />
          </NavigationBarItem>
          <NavigationBarItem label="Search" selected={tab}>
            <Icon name="search" size={24} filled={tab} />
          </NavigationBarItem>
        </NavigationRail>
      </Card>

        <Dialog open={showDialog} onPress={() => setShowDialog(false)}>
          <View style={{ display: "flex", flex: 1, justifyContent: "space-between", padding: 16, gap: 12, minWidth: 200 }}>
            <Text>Dialog content</Text>
            <Button style={{ marginLeft: "auto" }} label="Close" onPress={() => { setShowDialog(false); setMessage('Dialog closed'); }} />
          </View>
      </Dialog>

      <BottomSheet open={showBottomSheet} onRequestClose={() => setShowBottomSheet(false)}>
        <View style={{ padding: 16, gap: 12, minHeight: 48 }}>
          <Text>BottomSheet content</Text>
          <Button label="Dismiss" onPress={() => { setShowBottomSheet(false); setMessage('BottomSheet closed'); }} />
        </View>
      </BottomSheet>

      <DatePicker
        open={showDatePicker}
        value={selectedDate}
        onChange={(d) => { setSelectedDate(d); setMessage(`Date changed to ${d}`); }}
        onRequestClose={() => { setShowDatePicker(false); setMessage('DatePicker closed'); }}
      />

      <TimePicker
        open={showTimePicker}
        value={selectedTime}
        onChange={(t) => { setSelectedTime(t); setMessage(`Time changed to ${t}`); }}
        onRequestClose={() => { setShowTimePicker(false); setMessage('TimePicker closed'); }}
      />
      </View>
    </ScrollView>
  );
}

const host = globalThis as any;
if (typeof host.initRaylib === 'function') {
  host.initRaylib(1000, 720, 'Material Gallery');
}

render(<MaterialGallery />);
